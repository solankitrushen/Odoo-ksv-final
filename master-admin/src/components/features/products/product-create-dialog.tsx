"use client";

import { ProductCreateForm } from "@/components/features/products/product-create-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Product } from "@/lib/rental-types";

type ProductCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (product: Product) => void;
};

export function ProductCreateDialog({ open, onOpenChange, onCreated }: ProductCreateDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>Set tax, category, image, and starting stock.</DialogDescription>
        </DialogHeader>
        {open ? (
          <ProductCreateForm
            className="mx-0 max-w-none"
            onCancel={() => onOpenChange(false)}
            onSuccess={(product) => {
              onOpenChange(false);
              onCreated?.(product);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
