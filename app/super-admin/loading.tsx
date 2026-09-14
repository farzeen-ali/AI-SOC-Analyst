import { RouteSkeleton } from "@/components/dashboard/route-skeleton";

export default function Loading() {
  return <RouteSkeleton stats={6} rows={6} maxWidth="max-w-6xl" />;
}
