import { RouteSkeleton } from "@/components/dashboard/route-skeleton";

export default function Loading() {
  return <RouteSkeleton stats={3} rows={3} maxWidth="max-w-5xl" />;
}
