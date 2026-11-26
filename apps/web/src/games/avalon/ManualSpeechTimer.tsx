import { useEffect, useState } from 'react';
import type { Avalon } from '@tabletop/shared';
import { net } from '../../net/client';

export function ManualSpeechTimer({ view, canControl }: { view: Avalon.AvalonView; canControl: boolean }) {
  const duration = view.options.speechSeconds;
  const deadline = view.manualSpeechDeadline;
  const [now, setNow] = useState(net.serverNow);

  useEffect(() => {
    if (deadline === null) return;
    setNow(net.serverNow());
    const interval = window.setInterval(() => {
      const time = net.serverNow();
      setNow(time);
      if (time >= deadline) window.clearInterval(interval);
    }, 250);
    return () => window.clearInterval(interval);
  }, [deadline]);

  const remaining = deadline === null ? duration : Math.max(0, Math.min(duration, Math.ceil((deadline - now) / 1000)));
  const expired = deadline !== null && remaining === 0;
  const setTimer = (running: boolean) => net.act({
    type: 'set_manual_timer', running, questIndex: view.questIndex, rejectCount: view.rejectCount,
  } satisfies Avalon.AvalonAction);

  return (
    <div className="speech-status av-manual-timer">
      <span className="speech-progress" role="status">{expired ? '发言时间到' : '发言计时'}</span>
      <strong className={`speech-countdown${expired ? ' tone-evil' : ''}`} role="timer" aria-label="发言倒计时">
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
      </strong>
      {canControl && (
        <div className="av-manual-timer-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setTimer(true)}>
            {expired ? '下一位计时' : deadline === null ? '开始计时' : '重新计时'}
          </button>
          {deadline !== null && !expired && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setTimer(false)}>停止</button>
          )}
        </div>
      )}
    </div>
  );
}
