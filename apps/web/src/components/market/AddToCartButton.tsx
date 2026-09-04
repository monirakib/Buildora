"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { UserRole, type Product } from "@buildora/shared";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { flyToCart } from "@/lib/flyToCart";
import { useFlash } from "@/lib/useFlash";
import { useCart } from "@/store/useCart";
import { useSession } from "@/store/useSession";
import { toast } from "@/store/useToast";

/**
 * "Add to cart", with the whole response built in.
 *
 * Press it and three things happen in order: a copy of the product flies to
 * the cart button, the badge there pops, and the button itself turns into
 * "Added" with a drawn tick for a moment before offering to add again. The
 * network request runs underneath all of that; it only surfaces if it fails.
 *
 * Signed-out visitors are sent to sign in. Only land owners buy, so for any
 * other role the button renders nothing at all.
 */
export function AddToCartButton({
  product,
  imageEl,
  quantity = 1,
  label = "Add to cart",
  ...rest
}: {
  product: Product;
  /** The product image on the card, so the flight starts from it. */
  imageEl?: React.RefObject<HTMLElement | null>;
  quantity?: number;
  label?: string;
} & Omit<ButtonProps, "onClick" | "loading" | "success" | "children">) {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const add = useCart((s) => s.add);
  const ref = useRef<HTMLButtonElement>(null);

  const [busy, setBusy] = useState(false);
  const [added, flash] = useFlash(1800);

  // Before the session hydrates `user` is null on both server and client, so
  // the button renders for the signed-out case and becomes role-aware after.
  if (user && user.role !== UserRole.LAND_OWNER) return null;

  async function onClick() {
    if (!token || !user) {
      router.push("/auth");
      return;
    }
    if (busy) return;
    setBusy(true);
    const origin = imageEl?.current ?? ref.current;
    try {
      const flight = origin ? flyToCart(origin, product.imageUrl) : Promise.resolve();
      await add(token, product, quantity);
      await flight;
      flash();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that to your cart");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      ref={ref}
      onClick={onClick}
      loading={busy && !added}
      success={added}
      successLabel="Added"
      icon={<ShoppingCart className="h-4 w-4" />}
      aria-label={`${label}: ${product.name}`}
      {...rest}
    >
      {label}
    </Button>
  );
}
