"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type RevealProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Delay in ms before the fade-up plays once in view. */
  delay?: number;
  as?: "div" | "section" | "li" | "span" | "article";
};

/**
 * Fades + lifts its children into view the first time they're scrolled to.
 * Respects prefers-reduced-motion via the CSS rule in globals.css.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
  ...props
}: RevealProps) {
  const Tag = as as React.ElementType;
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={cn(shown && "animate-fade-up", className)}
      style={{ animationDelay: `${delay}ms` }}
      {...props}
    >
      {children}
    </Tag>
  );
}
