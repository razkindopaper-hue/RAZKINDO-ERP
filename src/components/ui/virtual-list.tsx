'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// =====================================================================
// VIRTUAL GRID — Virtual scrolling for CSS grid layouts
//
// Optimized for product cards and other grid-based lists.
// Renders only visible rows of the grid for smooth scrolling with hundreds of items.
//
// Usage:
//   <VirtualGrid
//     items={products}
//     columns={3}            // Number of columns in the grid
//     estimateSize={200}     // Estimated row height in px
//     gap={12}               // Gap between items in px
//     renderItem={(product) => <ProductCard product={product} />}
//     emptyMessage="Tidak ada produk"
//   />
// =====================================================================

interface VirtualGridProps<T> {
  items: T[];
  columns: number;
  estimateSize: number;
  gap?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  overscan?: number;
  emptyMessage?: string;
  getItemKey?: (item: T, index: number) => string;
  // Called when virtualizer needs the scroll container dimensions
  containerClassName?: string;
}

export function VirtualGrid<T>({
  items,
  columns,
  estimateSize,
  gap = 12,
  renderItem,
  className = '',
  overscan = 3,
  emptyMessage = 'Tidak ada data',
  getItemKey,
  containerClassName = '',
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Calculate number of rows
  const rowCount = Math.ceil(items.length / columns);

  // Calculate column width from container
  const columnWidth = containerWidth > 0
    ? (containerWidth - gap * (columns - 1)) / columns
    : 300;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  // Track container width for responsive columns
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  // Recalculate when items change
  useEffect(() => {
    virtualizer.measure();
  }, [items.length, columns, virtualizer]);

  if (items.length === 0) {
    return (
      <div className={containerClassName}>
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${containerClassName}`}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.index}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${gap}px`,
                padding: virtualRow.index === 0 ? `0 0 ${gap}px 0` : undefined,
              }}
            >
              {rowItems.map((item, colIndex) => {
                const globalIndex = startIndex + colIndex;
                const key = getItemKey
                  ? getItemKey(item, globalIndex)
                  : String(globalIndex);

                return (
                  <div key={key}>
                    {renderItem(item, globalIndex)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// VIRTUAL TABLE — Virtual scrolling for table rows
//
// Optimized for transaction lists and other table-based data.
// Renders only visible rows for smooth scrolling.
//
// Usage:
//   <VirtualTable
//     items={transactions}
//     estimateSize={64}
//     renderItem={(tx) => <TransactionRow transaction={tx} />}
//     header={<TableHeader>...</TableHeader>}
//   />
// =====================================================================

interface VirtualTableProps<T> {
  items: T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  overscan?: number;
  emptyMessage?: string;
  getItemKey?: (item: T, index: number) => string;
  containerClassName?: string;
}

export function VirtualTable<T>({
  items,
  estimateSize,
  renderItem,
  className = '',
  overscan = 10,
  emptyMessage = 'Tidak ada data',
  getItemKey,
  containerClassName = '',
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [items.length, virtualizer]);

  if (items.length === 0) {
    return (
      <div className={containerClassName}>
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${containerClassName}`}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          const key = getItemKey
            ? getItemKey(item, virtualRow.index)
            : String(virtualRow.index);

          return (
            <div
              key={key}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
