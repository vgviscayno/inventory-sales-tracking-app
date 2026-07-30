import { Id } from "../../../../convex/_generated/dataModel";
import { CustomerProfile } from "./CustomerProfile";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerProfile customerId={id as Id<"customers">} />;
}
