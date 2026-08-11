import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardProps = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
};

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
