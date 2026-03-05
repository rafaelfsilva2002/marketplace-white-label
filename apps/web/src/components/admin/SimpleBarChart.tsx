'use client';

interface BarChartDataPoint {
  label: string;
  value: number;
}

interface SimpleBarChartProps {
  data: BarChartDataPoint[];
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
}

export function SimpleBarChart({
  data,
  color = 'bg-primary',
  height = 200,
  formatValue = (v) => String(v),
  emptyMessage = 'Sem dados para o periodo',
}: SimpleBarChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex flex-col gap-2">
      {/* Chart area */}
      <div
        className="flex items-end gap-1"
        style={{ height }}
      >
        {data.map((item, index) => {
          const barHeight = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div
              key={`${item.label}-${index}`}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: '100%' }}
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background shadow group-hover:block">
                {formatValue(item.value)}
              </div>
              {/* Bar */}
              <div
                className={`w-full min-w-[4px] rounded-t transition-all duration-300 ${color}`}
                style={{
                  height: `${Math.max(barHeight, 2)}%`,
                  opacity: barHeight > 0 ? 1 : 0.3,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-1">
        {data.map((item, index) => {
          // Show fewer labels when there are many data points
          const showLabel =
            data.length <= 14 ||
            index === 0 ||
            index === data.length - 1 ||
            index % Math.ceil(data.length / 7) === 0;
          return (
            <div
              key={`label-${item.label}-${index}`}
              className="flex-1 text-center"
            >
              {showLabel && (
                <span className="text-[10px] text-muted-foreground">
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Horizontal bar variant for rankings ---------- */

interface HorizontalBarProps {
  data: BarChartDataPoint[];
  color?: string;
  formatValue?: (value: number) => string;
  maxItems?: number;
}

export function HorizontalBarChart({
  data,
  color = 'bg-primary',
  formatValue = (v) => String(v),
  maxItems = 10,
}: HorizontalBarProps) {
  const items = data.slice(0, maxItems);
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Sem dados
      </div>
    );
  }

  const maxValue = Math.max(...items.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const widthPercent =
          maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        return (
          <div key={`${item.label}-${index}`} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate font-medium">{item.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatValue(item.value)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${color}`}
                style={{ width: `${Math.max(widthPercent, 1)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
