import { Suspense } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ProductDetail } from "./ProductDetail";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Suspense boundary is for the prototype's useSearchParams — see ./prototype.
  return (
    <Suspense fallback={null}>
      <ProductDetail productId={id as Id<"products">} />
    </Suspense>
  );
}
