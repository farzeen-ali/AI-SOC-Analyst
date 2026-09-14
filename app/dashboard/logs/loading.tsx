import { RouteSkeleton } from "@/components/dashboard/route-skeleton";

export default function Loading() {
  return <RouteSkeleton stats={4} rows={5} maxWidth="max-w-6xl" />;
}
