import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { ClickSpark } from './fx/ClickSpark';
import { Motes } from './fx/Motes';
import { GAME_CLIENTS } from './games/registry';
import { dismissNotice, useNet } from './net/client';
import { navigate, roomPath, useRoute } from './net/route';
import { Home } from './pages/Home';
import { RoomPage } from './pages/RoomPage';

export function App() {
  const route = useRoute();
  const { room, notice, link } = useNet();

  // 进入（或被带回）某个房间时，把地址栏同步过去，方便直接分享链接
  const code = room?.code;
  useEffect(() => {
    if (code) navigate(roomPath(code));
  }, [code]);

  // 标签页标题跟着所在的房间走，开着几个标签页时好分辨
  const gameName = room ? GAME_CLIENTS[room.gameId]?.name : undefined;
  useEffect(() => {
    document.title = code && route.page === 'room' ? `${gameName ?? '房间'} ${code} - 桌游厅` : '桌游厅';
  }, [code, gameName, route.page]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismissNotice, 3600);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <>
      <div className="backdrop">
        <Motes />
      </div>
      <div className="page">{route.page === 'home' ? <Home /> : <RoomPage code={route.code} key={route.code} />}</div>
      <ClickSpark />
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            className="toast"
            role="alert"
            initial={{ opacity: 0, y: -16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -16, x: '-50%' }}
            onClick={dismissNotice}
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>
      {link === 'offline' && <div className="link-status">连接断开了，正在重连…</div>}
    </>
  );
}
