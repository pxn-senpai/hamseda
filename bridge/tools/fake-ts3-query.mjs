// A tiny FAKE TeamSpeak ServerQuery server, only for testing the bridge on your own computer.
// It is not TeamSpeak and not secure. Run:  npm run fake-query -w bridge
// Then connect in the app with mode "ServerQuery", address 127.0.0.1, query port 10011.

import net from 'node:net';

const PORT = Number(process.env.FAKE_QUERY_PORT || 10011);

const esc = (v) =>
  String(v).replace(/\\/g, '\\\\').replace(/\//g, '\\/').replace(/ /g, '\\s').replace(/\|/g, '\\p');
const row = (o) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${esc(v)}`)
    .join(' ');
const rows = (list) => list.map(row).join('|');

const channels = [
  { cid: 1, pid: 0, channel_order: 0, channel_name: '[cspacer]Fake Lobby', channel_flag_password: 0, channel_maxclients: -1, total_clients: 0 },
  { cid: 2, pid: 0, channel_order: 1, channel_name: 'Main Room', channel_flag_password: 0, channel_maxclients: -1, total_clients: 2 },
  { cid: 3, pid: 0, channel_order: 2, channel_name: 'Second Room', channel_flag_password: 0, channel_maxclients: 8, total_clients: 1 },
  { cid: 4, pid: 3, channel_order: 0, channel_name: 'Sub Room', channel_flag_password: 1, channel_maxclients: -1, total_clients: 0 },
];
const clients = [
  { clid: 5, cid: 2, client_database_id: 5, client_nickname: 'Alice', client_type: 0, client_away: 0, client_input_muted: 0, client_output_muted: 0, client_servergroups: '6' },
  { clid: 6, cid: 2, client_database_id: 6, client_nickname: 'Bob', client_type: 0, client_away: 1, client_away_message: 'lunch', client_input_muted: 1, client_output_muted: 0, client_servergroups: '7' },
  { clid: 7, cid: 3, client_database_id: 7, client_nickname: 'Carol', client_type: 0, client_away: 0, client_input_muted: 0, client_output_muted: 1, client_servergroups: '7' },
];
const groups = [
  { sgid: 6, name: 'Server Admin', type: 1, iconid: 0, savedb: 1, sortid: 100, namemode: 0 },
  { sgid: 7, name: 'Member', type: 1, iconid: 0, savedb: 1, sortid: 200, namemode: 0 },
  { sgid: 2, name: 'Admin Server Query', type: 2, iconid: 0, savedb: 1, sortid: 0, namemode: 0 },
];

function answer(cmd) {
  const name = cmd.split(' ')[0];
  switch (name) {
    case 'channellist':
      return rows(channels);
    case 'clientlist':
      return rows(clients);
    case 'servergrouplist':
      return rows(groups);
    case 'serverinfo':
      return row({
        virtualserver_name: 'Fake TeamSpeak (test only)',
        virtualserver_welcomemessage: 'This is a fake server for testing.',
      });
    case 'whoami':
      return row({ virtualserver_status: 'online', virtualserver_id: 1, client_id: 99, client_channel_id: 1, client_nickname: 'query', client_database_id: 1, client_login_name: '', client_unique_identifier: 'x', client_origin_server_id: 0 });
    case 'version':
      return row({ version: '3.13.8', build: 1, platform: 'Fake' });
    default:
      return null; // login, use, clientupdate, servernotifyregister, quit, ... -> just "ok"
  }
}

const server = net.createServer((socket) => {
  socket.write('TS3\n\rWelcome to the TeamSpeak 3 ServerQuery interface, type "help" for a list of commands and "help <command>" for information on a specific command.\n\r');
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const cmd = buf.slice(0, i).replace(/\r$/, '').trim();
      buf = buf.slice(i + 1);
      if (!cmd) continue;
      const data = answer(cmd);
      if (data) socket.write(`${data}\n\r`);
      socket.write('error id=0 msg=ok\n\r');
      if (cmd === 'quit') socket.end();
    }
  });
  socket.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => console.log(`[fake-query] listening on 127.0.0.1:${PORT}`));
