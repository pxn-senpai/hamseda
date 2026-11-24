//! Voice audio: microphone capture, Opus encoding, the transmit gate (push-to-talk or
//! voice activation), decoding incoming voice, and playback.
//!
//! Device I/O (cpal) lives on its own thread, because cpal streams are not always `Send`.
//! The rest of the code only sees channels and a shared `Playback` object.

use std::sync::{mpsc as std_mpsc, Arc, Mutex};

use anyhow::{anyhow, Result};
use audiopus::coder::Encoder as OpusEncoder;
use audiopus::{Application, Channels, SampleRate};
use tokio::sync::mpsc;
use tsclientlib::audio::AudioHandler;
use tsproto_packets::packets::InAudioBuf;
use tsproto_packets::packets::{AudioData, CodecType, OutAudio, OutPacket};

/// TeamSpeak voice is 48 kHz. We do not resample yet, so devices must support 48 kHz.
pub const SAMPLE_RATE: u32 = 48_000;
/// 20 ms of mono audio at 48 kHz. Opus is happiest with this frame size.
pub const FRAME_SAMPLES: usize = 960;
/// How many silent frames to keep sending after speech stops (about 200 ms).
const HANGOVER_FRAMES: u32 = 10;
/// Upper bound for one encoded Opus frame.
const MAX_OPUS_BYTES: usize = 1275;

/// How the microphone decides when to send.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TransmitMode {
	/// Send only while the push-to-talk key is held.
	PushToTalk,
	/// Send when the input level is above `threshold_db` (dBFS, usually around -40).
	VoiceActivation { threshold_db: f32 },
}

/// Opus encoder for mono 48 kHz voice.
pub struct Encoder {
	inner: OpusEncoder,
}

impl Encoder {
	pub fn new() -> Result<Self> {
		let inner = OpusEncoder::new(SampleRate::Hz48000, Channels::Mono, Application::Voip)
			.map_err(|e| anyhow!("could not start the Opus encoder: {e}"))?;
		Ok(Self { inner })
	}

	/// Encodes one frame of `FRAME_SAMPLES` samples. Returns the encoded bytes.
	pub fn encode(&mut self, pcm: &[f32], out: &mut [u8]) -> Result<usize> {
		self.inner
			.encode_float(pcm, out)
			.map_err(|e| anyhow!("Opus encode failed: {e}"))
	}
}

/// Level of one frame in dBFS (0 is full scale, silence is very negative).
pub fn level_db(frame: &[f32]) -> f32 {
	let mean = frame.iter().map(|s| s * s).sum::<f32>() / frame.len().max(1) as f32;
	10.0 * mean.max(1e-12).log10()
}

/// Decides, frame by frame, whether the microphone audio should be sent.
pub struct Gate {
	mode: TransmitMode,
	ptt_down: bool,
	hangover: u32,
}

impl Gate {
	pub fn new(mode: TransmitMode) -> Self {
		Self {
			mode,
			ptt_down: false,
			hangover: 0,
		}
	}

	pub fn set_mode(&mut self, mode: TransmitMode) {
		self.mode = mode;
		self.hangover = 0;
	}

	pub fn set_ptt(&mut self, down: bool) {
		self.ptt_down = down;
	}

	/// True if this frame should be sent.
	pub fn allow(&mut self, frame: &[f32]) -> bool {
		match self.mode {
			TransmitMode::PushToTalk => self.ptt_down,
			TransmitMode::VoiceActivation { threshold_db } => {
				if level_db(frame) >= threshold_db {
					self.hangover = HANGOVER_FRAMES;
					true
				} else if self.hangover > 0 {
					self.hangover -= 1;
					true
				} else {
					false
				}
			}
		}
	}
}

/// Turns microphone frames into TeamSpeak voice packets.
pub struct Sender {
	encoder: Encoder,
	gate: Gate,
	packet_id: u16,
	buf: Vec<u8>,
}

impl Sender {
	pub fn new(mode: TransmitMode) -> Result<Self> {
		Ok(Self {
			encoder: Encoder::new()?,
			gate: Gate::new(mode),
			packet_id: 0,
			buf: vec![0; MAX_OPUS_BYTES],
		})
	}

	pub fn set_mode(&mut self, mode: TransmitMode) {
		self.gate.set_mode(mode);
	}

	pub fn set_ptt(&mut self, down: bool) {
		self.gate.set_ptt(down);
	}

	/// Returns a voice packet to send, or `None` when the frame is muted or gated out.
	pub fn process(&mut self, frame: &[f32], input_muted: bool) -> Result<Option<OutPacket>> {
		if input_muted || !self.gate.allow(frame) {
			return Ok(None);
		}
		let n = self.encoder.encode(frame, &mut self.buf)?;
		let id = self.packet_id;
		self.packet_id = self.packet_id.wrapping_add(1);
		let packet = OutAudio::new(&AudioData::C2S {
			id,
			codec: CodecType::OpusVoice,
			data: &self.buf[..n],
		});
		Ok(Some(packet))
	}
}

/// Decodes and mixes the voices we receive. Shared between the connection task (which
/// pushes packets) and the playback thread (which pulls samples).
pub struct Playback {
	handler: AudioHandler<u16>,
	/// When true we are deafened: nothing is played.
	pub muted: bool,
}

impl Playback {
	pub fn new() -> Self {
		Self {
			handler: AudioHandler::new(slog::Logger::root(slog::Discard, slog::o!())),
			muted: false,
		}
	}

	/// Queues one incoming voice packet. Packets from unknown codecs are ignored.
	pub fn push(&mut self, packet: InAudioBuf) {
		let from = match packet.data().data() {
			AudioData::S2C { from, .. } | AudioData::S2CWhisper { from, .. } => *from,
			_ => return,
		};
		let _ = self.handler.handle_packet(from, packet);
	}

	/// Fills `out` (interleaved stereo, 48 kHz). Silence when deafened.
	pub fn fill(&mut self, out: &mut [f32]) {
		out.iter_mut().for_each(|s| *s = 0.0);
		if !self.muted {
			self.handler.fill_buffer(out);
		}
	}
}

impl Default for Playback {
	fn default() -> Self {
		Self::new()
	}
}

/// Running microphone and speaker streams. Dropping it stops them.
pub struct Engine {
	/// Mono microphone frames of `FRAME_SAMPLES` samples each.
	pub frames: mpsc::UnboundedReceiver<Vec<f32>>,
	_stop: std_mpsc::Sender<()>,
}

/// Names of the audio devices on this computer, for the settings screen.
#[derive(Debug, Clone, serde::Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevices {
	pub inputs: Vec<String>,
	pub outputs: Vec<String>,
}

/// Lists the microphones and speakers the system reports.
pub fn list_devices() -> AudioDevices {
	use cpal::traits::{DeviceTrait, HostTrait};

	let host = cpal::default_host();
	let names = |devices: Result<Vec<cpal::Device>, cpal::Error>| -> Vec<String> {
		devices
			.map(|list| {
				list.iter()
					.filter_map(|d| d.description().ok().map(|x| x.name().to_owned()))
					.collect()
			})
			.unwrap_or_default()
	};
	AudioDevices {
		inputs: names(host.input_devices().map(|it| it.collect())),
		outputs: names(host.output_devices().map(|it| it.collect())),
	}
}

/// Starts the microphone and speaker. `None` means the system default device.
/// Errors if a device is missing or unusable.
pub fn start(
	playback: Arc<Mutex<Playback>>,
	input: Option<&str>,
	output: Option<&str>,
) -> Result<Engine> {
	let (frame_tx, frame_rx) = mpsc::unbounded_channel();
	let (stop_tx, stop_rx) = std_mpsc::channel::<()>();
	let (ready_tx, ready_rx) = std_mpsc::channel::<Result<(), String>>();

	let input = input.map(str::to_owned);
	let output = output.map(str::to_owned);
	std::thread::spawn(move || {
		match open_devices(frame_tx, playback, input.as_deref(), output.as_deref()) {
			Ok(_streams) => {
				let _ = ready_tx.send(Ok(()));
				// Keep the streams alive until the engine is dropped.
				let _ = stop_rx.recv();
			}
			Err(e) => {
				let _ = ready_tx.send(Err(format!("{e:#}")));
			}
		}
	});

	match ready_rx.recv() {
		Ok(Ok(())) => Ok(Engine {
			frames: frame_rx,
			_stop: stop_tx,
		}),
		Ok(Err(msg)) => Err(anyhow!(msg)),
		Err(_) => Err(anyhow!("the audio thread stopped unexpectedly")),
	}
}

/// The first device whose name matches `name`.
fn find_device(devices: Vec<cpal::Device>, name: &str) -> Option<cpal::Device> {
	use cpal::traits::DeviceTrait;

	devices
		.into_iter()
		.find(|d| d.description().map(|x| x.name() == name).unwrap_or(false))
}

/// Converts audio between sample rates with linear interpolation. It keeps state between
/// calls, so frames join smoothly. Good enough for voice.
pub struct Resampler {
	step: f64,
	pos: f64,
	prev: f32,
}

impl Resampler {
	pub fn new(from: u32, to: u32) -> Self {
		Self {
			step: from as f64 / to as f64,
			pos: 1.0,
			prev: 0.0,
		}
	}

	/// Appends the converted samples of `input` to `out`.
	pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
		if (self.step - 1.0).abs() < f64::EPSILON {
			out.extend_from_slice(input);
			return;
		}
		// v[0] is the last sample of the previous block, v[1..] is this block.
		let mut v = Vec::with_capacity(input.len() + 1);
		v.push(self.prev);
		v.extend_from_slice(input);
		while self.pos + 1.0 < v.len() as f64 {
			let i = self.pos.floor() as usize;
			let frac = (self.pos - i as f64) as f32;
			out.push(v[i] * (1.0 - frac) + v[i + 1] * frac);
			self.pos += self.step;
		}
		self.prev = v[v.len() - 1];
		self.pos -= (v.len() - 1) as f64;
	}
}

/// Opens the microphone and speaker. The returned streams must stay alive.
///
/// Devices may run at any rate; audio is converted to 48 kHz for Opus and back.
fn open_devices(
	frame_tx: mpsc::UnboundedSender<Vec<f32>>,
	playback: Arc<Mutex<Playback>>,
	input: Option<&str>,
	output: Option<&str>,
) -> Result<(cpal::Stream, cpal::Stream)> {
	use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

	let host = cpal::default_host();

	// Microphone: downmix to mono, convert to 48 kHz, then cut into 20 ms frames.
	let mic = match input {
		Some(name) => find_device(host.input_devices()?.collect(), name)
			.ok_or_else(|| anyhow!("the microphone '{name}' was not found"))?,
		None => host
			.default_input_device()
			.ok_or_else(|| anyhow!("no microphone was found"))?,
	};
	let mic_cfg = mic
		.default_input_config()
		.map_err(|e| anyhow!("microphone error: {e}"))?;
	let mic_rate = mic_cfg.sample_rate();
	let mic_channels = mic_cfg.channels() as usize;
	let mut to_48k = Resampler::new(mic_rate, SAMPLE_RATE);
	let mut pending: Vec<f32> = Vec::with_capacity(FRAME_SAMPLES * 2);
	let mut mono: Vec<f32> = Vec::new();
	let mut converted: Vec<f32> = Vec::new();
	let input = mic.build_input_stream(
		mic_cfg.config(),
		move |data: &[f32], _: &cpal::InputCallbackInfo| {
			mono.clear();
			for chunk in data.chunks(mic_channels.max(1)) {
				mono.push(chunk.iter().sum::<f32>() / chunk.len() as f32);
			}
			converted.clear();
			to_48k.process(&mono, &mut converted);
			pending.extend_from_slice(&converted);
			while pending.len() >= FRAME_SAMPLES {
				let frame: Vec<f32> = pending.drain(..FRAME_SAMPLES).collect();
				let _ = frame_tx.send(frame);
			}
		},
		|err| eprintln!("microphone stream error: {err}"),
		None,
	)?;

	// Speaker: pull 48 kHz stereo from the decoder, mix to mono, convert to the device rate.
	let speaker = match output {
		Some(name) => find_device(host.output_devices()?.collect(), name)
			.ok_or_else(|| anyhow!("the speaker '{name}' was not found"))?,
		None => host
			.default_output_device()
			.ok_or_else(|| anyhow!("no speaker or headphones were found"))?,
	};
	let out_cfg = speaker
		.default_output_config()
		.map_err(|e| anyhow!("speaker error: {e}"))?;
	let out_rate = out_cfg.sample_rate();
	let out_channels = out_cfg.channels() as usize;
	let mut to_device = Resampler::new(SAMPLE_RATE, out_rate);
	let mut stereo: Vec<f32> = Vec::new();
	let mut mono48: Vec<f32> = Vec::new();
	let mut device_mono: Vec<f32> = Vec::new();
	let output = speaker.build_output_stream(
		out_cfg.config(),
		move |out: &mut [f32], _: &cpal::OutputCallbackInfo| {
			let frames = out.len() / out_channels.max(1);
			// How many 48 kHz samples this callback needs, plus a little margin.
			let need48 = (frames as f64 * SAMPLE_RATE as f64 / out_rate as f64).ceil() as usize + 4;
			stereo.resize(need48 * 2, 0.0);
			match playback.lock() {
				Ok(mut p) => p.fill(&mut stereo),
				Err(_) => stereo.iter_mut().for_each(|s| *s = 0.0),
			}
			mono48.clear();
			mono48.extend(stereo.chunks_exact(2).map(|lr| (lr[0] + lr[1]) * 0.5));
			device_mono.clear();
			to_device.process(&mono48, &mut device_mono);
			for (i, frame) in out.chunks_mut(out_channels.max(1)).enumerate() {
				let sample = device_mono.get(i).copied().unwrap_or(0.0);
				frame.iter_mut().for_each(|s| *s = sample);
			}
		},
		|err| eprintln!("speaker stream error: {err}"),
		None,
	)?;

	input.play()?;
	output.play()?;
	Ok((input, output))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn silence_is_very_quiet_and_a_tone_is_loud() {
		let silence = vec![0.0f32; FRAME_SAMPLES];
		let tone: Vec<f32> = (0..FRAME_SAMPLES)
			.map(|i| 0.5 * (i as f32 * 2.0 * std::f32::consts::PI * 440.0 / 48_000.0).sin())
			.collect();
		assert!(level_db(&silence) < -100.0);
		assert!(level_db(&tone) > -20.0);
	}

	#[test]
	fn push_to_talk_only_sends_while_held() {
		let mut gate = Gate::new(TransmitMode::PushToTalk);
		let frame = vec![0.5f32; FRAME_SAMPLES];
		assert!(!gate.allow(&frame));
		gate.set_ptt(true);
		assert!(gate.allow(&frame));
		gate.set_ptt(false);
		assert!(!gate.allow(&frame));
	}

	#[test]
	fn voice_activation_has_a_hangover() {
		let mut gate = Gate::new(TransmitMode::VoiceActivation { threshold_db: -40.0 });
		let loud = vec![0.5f32; FRAME_SAMPLES];
		let quiet = vec![0.0f32; FRAME_SAMPLES];
		assert!(gate.allow(&loud));
		// Silence right after speech is still sent for a short while.
		assert!(gate.allow(&quiet));
		let mut sent_after = 0;
		while gate.allow(&quiet) {
			sent_after += 1;
		}
		assert_eq!(sent_after, HANGOVER_FRAMES - 1);
	}

	#[test]
	fn opus_round_trip_keeps_the_signal_roughly() {
		use audiopus::coder::Decoder;

		let mut enc = Encoder::new().unwrap();
		let frame: Vec<f32> = (0..FRAME_SAMPLES)
			.map(|i| 0.4 * (i as f32 * 2.0 * std::f32::consts::PI * 300.0 / 48_000.0).sin())
			.collect();
		let mut bytes = vec![0u8; MAX_OPUS_BYTES];
		let n = enc.encode(&frame, &mut bytes).unwrap();
		assert!(n > 0 && n < 400, "a 20 ms voice frame should be small, got {n} bytes");

		let mut dec = Decoder::new(SampleRate::Hz48000, Channels::Mono).unwrap();
		let mut out = vec![0f32; FRAME_SAMPLES];
		let decoded = dec
			.decode_float(Some(&bytes[..n]), &mut out[..], false)
			.unwrap();
		assert_eq!(decoded, FRAME_SAMPLES);
		assert!(level_db(&out) > -25.0, "decoded frame should still have energy");
	}

	#[test]
	fn resampler_keeps_length_and_pitch() {
		// 1 kHz tone at 44.1 kHz, converted to 48 kHz in several small blocks.
		let from = 44_100u32;
		let mut rs = Resampler::new(from, SAMPLE_RATE);
		let total: Vec<f32> = (0..from as usize / 2)
			.map(|i| (i as f32 * 2.0 * std::f32::consts::PI * 1000.0 / from as f32).sin())
			.collect();
		let mut out = Vec::new();
		for block in total.chunks(441) {
			rs.process(block, &mut out);
		}
		let expected = total.len() as f64 * SAMPLE_RATE as f64 / from as f64;
		assert!((out.len() as f64 - expected).abs() < 4.0, "got {}, expected about {}", out.len(), expected);
		// Zero crossings per second should match the 1 kHz tone (about 2000 per second).
		let crossings = out.windows(2).filter(|w| w[0] <= 0.0 && w[1] > 0.0).count();
		let seconds = out.len() as f64 / SAMPLE_RATE as f64;
		let freq = crossings as f64 / seconds;
		assert!((freq - 1000.0).abs() < 20.0, "measured {freq} Hz");
	}
}
