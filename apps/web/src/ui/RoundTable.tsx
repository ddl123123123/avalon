import type { ReactNode } from 'react';

/**
 * 一张椭圆的桌子，座位沿桌边排开。与具体桌游无关。
 * 座位按顺时针排列，「我」固定坐在正下方。
 */
export function RoundTable<T>({
  seats,
  meIndex,
  surface,
  center,
  renderSeat,
  seatKey,
  className = '',
}: {
  seats: T[];
  meIndex: number;
  surface: ReactNode;
  center?: ReactNode;
  renderSeat: (seat: T, index: number) => ReactNode;
  seatKey: (seat: T, index: number) => string;
  className?: string;
}) {
  const n = seats.length;
  const origin = meIndex < 0 ? 0 : meIndex;
  return (
    <div className={`round-table ${className}`} data-seats={n}>
      {/* 内圈比外框各缩进半个座位，座位的中心正好落在椭圆上而不会超出外框 */}
      <div className="round-table-ring">
        <div className="round-table-surface">{surface}</div>
        {center && <div className="round-table-center">{center}</div>}
        {seats.map((seat, i) => {
          // 屏幕坐标里 y 轴朝下，角度增加即顺时针：正下方 → 左 → 上 → 右
          const angle = ((90 + ((i - origin + n) % n) * (360 / n)) * Math.PI) / 180;
          return (
            <div
              key={seatKey(seat, i)}
              className="round-table-seat"
              style={{ left: `${50 + 50 * Math.cos(angle)}%`, top: `${50 + 50 * Math.sin(angle)}%` }}
            >
              {renderSeat(seat, i)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
