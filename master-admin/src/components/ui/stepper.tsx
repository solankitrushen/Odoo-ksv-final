"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepperStep[];
  currentStep: number;
  onStepChange?: (step: number) => void;
  /** When true, user can only go to next step after completing current (optional validation) */
  linear?: boolean;
  /** When true, user can click any step to jump (non-linear) */
  allowJump?: boolean;
  className?: string;
  stepClassName?: string;
  /** Dashboard theme: outline style for non-active step buttons */
  outlineButtonClass?: string;
  /** Dashboard theme: primary style for active step */
  primaryButtonClass?: string;
}

/**
 * Multi-step form stepper – dashboard UI structure.
 * Inspired by form wizards (e.g. CoreUI Stepper): horizontal step indicators with labels,
 * optional next/back, and support for linear or non-linear navigation.
 * @see https://coreui.io/react/docs/forms/stepper/
 */
export function Stepper({
  steps,
  currentStep,
  onStepChange,
  linear = false,
  allowJump = true,
  className,
  stepClassName,
  outlineButtonClass,
  primaryButtonClass,
}: StepperProps) {
  const safeStep = Math.max(0, Math.min(currentStep, steps.length - 1));

  return (
    <nav
      aria-label="Progress"
      className={cn("w-full min-w-0", className)}
    >
      <ol
        role="list"
        className={cn(
          "flex min-w-0 items-center justify-between gap-1 rounded-xl border border-border bg-card p-4 dark:border-[#2a2a2a] dark:bg-[#1c1c1c]",
          "text-foreground dark:text-[#fafafa]"
        )}
      >
        {steps.map((step, index) => {
          const isCompleted = index < safeStep;
          const isCurrent = index === safeStep;
          const isFuture = index > safeStep;
          const isClickable =
            allowJump &&
            !!onStepChange &&
            (!linear || index < safeStep);

          return (
            <li
              key={step.id}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center",
                index < steps.length - 1 && "after:content-[''] after:flex-1 after:min-w-[0.25rem] after:border-b after:border-border dark:after:border-[#2a2a2a]",
                linear && isFuture && "opacity-60",
                stepClassName
              )}
              style={index < steps.length - 1 ? { marginRight: "0.25rem" } : undefined}
            >
              <div className="flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => isClickable && onStepChange?.(index)}
                  disabled={!isClickable}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={step.description ? `${step.label}: ${step.description}` : step.label}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isCurrent && primaryButtonClass,
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isCompleted && primaryButtonClass,
                    !isCurrent && !isCompleted && "border-border bg-muted text-muted-foreground dark:bg-[#262626]",
                    !isCurrent && !isCompleted && outlineButtonClass,
                    isClickable && "cursor-pointer hover:opacity-90"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>
                <span
                  className={cn(
                    "min-w-0 truncate text-sm font-medium",
                    (isCurrent || !isCompleted) && "text-foreground",
                    !isCurrent && isCompleted && "text-muted-foreground dark:text-[#a3a3a3]"
                  )}
                  title={step.label}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface StepperFooterProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  /** When true, Next/Submit button is disabled (e.g. form invalid) */
  nextDisabled?: boolean;
  backLabel?: string;
  nextLabel?: string;
  submitLabel?: string;
  primaryButtonClass?: string;
  outlineButtonClass?: string;
  className?: string;
}

/**
 * Footer for stepper: Back / Next or Submit on last step.
 */
export function StepperFooter({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  isSubmitting = false,
  nextDisabled = false,
  backLabel = "Back",
  nextLabel = "Next",
  submitLabel = "Save",
  primaryButtonClass,
  outlineButtonClass,
  className,
}: StepperFooterProps) {
  const isFirst = currentStep <= 0;
  const isLast = currentStep >= totalSteps - 1;
  const nextOrSubmitDisabled = isSubmitting || nextDisabled;

  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-border pt-4 dark:border-[#2a2a2a]",
        className
      )}
    >
      <div>
        {!isFirst && (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className={outlineButtonClass}
            disabled={isSubmitting}
          >
            {backLabel}
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        {!isLast ? (
          <Button
            type="button"
            onClick={onNext}
            className={primaryButtonClass}
            disabled={nextOrSubmitDisabled}
          >
            {nextLabel}
          </Button>
        ) : (
          onSubmit && (
            <Button
              type="button"
              onClick={onSubmit}
              className={primaryButtonClass}
              disabled={nextOrSubmitDisabled}
            >
              {isSubmitting ? "Saving…" : submitLabel}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
