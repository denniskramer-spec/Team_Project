import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dmTitleKey } from '../../constants.js';

// The path of a direct message with someone. The person travels in the
// navigation state, so the conversation has a name before its first message
// puts it in the nav.
export const dmPath = (peer) => ({
  to: `/chat/${dmTitleKey(peer.id)}`,
  state: { peer: { id: String(peer.id), name: peer.name, role: peer.role, group: peer.group?.name ?? peer.group ?? null } },
});

// "Message" buttons and chat popups open the conversation under Chat.
export function useOpenDm() {
  const navigate = useNavigate();
  return useCallback((peer) => {
    const { to, state } = dmPath(peer);
    navigate(to, { state });
  }, [navigate]);
}
