import type { Id } from "../../../../../convex/_generated/dataModel";
import { SupplierProfile } from "./SupplierProfile";

export default async function SupplierProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierProfile supplierId={id as Id<"suppliers">} />;
}
