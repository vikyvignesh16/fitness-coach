import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type DataTable = { columns: string[]; rows: (string | number | null)[][] };

/**
 * The frame every Insights chart sits in: a title, a line saying what the chart is for, the chart, and the same
 * numbers as a table. An empty cell says "no data", because missing is not the same as zero.
 */
export function ChartCard({ title, purpose, hasData, table, children }: {
  title: string;
  purpose: string;
  hasData: boolean;
  table: DataTable;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{purpose}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasData ? children : <p className="text-muted-foreground py-6 text-center text-sm">No data in this range.</p>}
        {hasData && (
          <details className="text-sm">
            <summary className="text-muted-foreground min-h-11 cursor-pointer py-2">Data table</summary>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="text-muted-foreground sticky top-0">
                  <tr>{table.columns.map((c) => <th key={c} className="bg-card py-1 pr-3 font-medium">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {row.map((cell, j) => (
                        <td key={j} className={`py-1 pr-3 ${cell === null ? "text-muted-foreground" : ""}`}>{cell === null ? "no data" : cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
