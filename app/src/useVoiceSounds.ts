import { useEffect, useRef } from 'react';
import type { ServerState } from './types';
import { playJoin, playLeave } from './sounds';

interface Previous {
  channel: number | null;
  /** Other users and the channel they were in. */
  others: Map<number, number>;
}

/**
 * Plays a join or leave sound when we enter or leave a channel, and when someone else
 * enters or leaves the channel we are in. The first snapshot of a connection is silent.
 */
export function useVoiceSounds(servers: Record<string, ServerState>) {
  const previous = useRef(new Map<string, Previous>());

  useEffect(() => {
    for (const server of Object.values(servers)) {
      const id = server.config.id;
      const snap = server.snapshot;
      if (!snap) {
        previous.current.delete(id);
        continue;
      }
      const me = snap.clients.find((c) => c.isSelf);
      const channel = me ? me.channelId : null;
      const others = new Map<number, number>();
      for (const c of snap.clients) if (!c.isSelf) others.set(c.id, c.channelId);

      const prev = previous.current.get(id);
      previous.current.set(id, { channel, others });
      if (!prev) continue;

      if (channel !== prev.channel) {
        // We moved: a join sound when we arrive somewhere, a leave sound when we only leave.
        if (channel !== null) playJoin();
        else if (prev.channel !== null) playLeave();
        continue;
      }
      if (channel === null) continue;

      // Someone entered or left our channel while we stayed in it.
      let joined = false;
      let left = false;
      for (const [userId, ch] of others) {
        if (ch === channel && prev.others.get(userId) !== channel) joined = true;
      }
      for (const [userId, ch] of prev.others) {
        if (ch === channel && others.get(userId) !== channel) left = true;
      }
      if (joined) playJoin();
      else if (left) playLeave();
    }
  }, [servers]);
}
