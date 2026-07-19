"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Subtle route-content transition: a quick fade with a slight slide-up,
 * keyed by pathname so each navigation re-animates. Kept fast (~150ms) to
 * stay snappy and avoid perceptible navigation lag.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
