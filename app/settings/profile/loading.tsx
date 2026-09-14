import { RouteSkeleton } from "@/components/dashboard/route-skeleton";

export default function Loading() {
  return <RouteSkeleton stats={0} rows={4} maxWidth="max-w-3xl" />;
}
