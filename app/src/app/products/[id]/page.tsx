import { Id } from "../../../../convex/_generated/dataModel";
import { ProductDetail } from "./ProductDetail";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetail productId={id as Id<"products">} />;
}
