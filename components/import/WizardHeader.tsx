"use client";

import React from "react";
import { Upload, MapPin, Shuffle, Eye, CheckCircle2, Hash } from "lucide-react";
import { useRouter } from "next/navigation";

interface WizardHeaderProps {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
  onStepClick?: (stepId: 1 | 2 | 3 | 4 | 5 | 6) => void;
}

export default function WizardHeader({ currentStep, onStepClick }: WizardHeaderProps) {
  const router = useRouter();

  const steps = [
    { id: 1, label: "Upload File", desc: "Choose CSV or Excel file", icon: Upload },
    { id: 2, label: "Map Fields", desc: "Match your columns", icon: MapPin },
    { id: 3, label: "Map Plans", desc: "Link membership plans", icon: Shuffle },
    { id: 4, label: "Assign IDs", desc: "Auto-assign member IDs", icon: Hash },
    { id: 5, label: "Preview", desc: "Review before import", icon: Eye },
    { id: 6, label: "Complete", desc: "View results", icon: CheckCircle2 },
  ];

  const handleStepClick = (stepId: number) => {
    if (onStepClick) {
      onStepClick(stepId as 1 | 2 | 3 | 4 | 5 | 6);
      return;
    }

    switch (stepId) {
      case 1:
        router.push("/owner/import?step=1");
        break;
      case 2:
        router.push("/owner/import?step=2");
        break;
      case 3:
        router.push("/owner/import?step=3");
        break;
      case 4:
        router.push("/owner/import/review");
        break;
      case 5:
        router.push("/owner/import/edit");
        break;
      case 6:
        router.push("/owner/import/edit?step=done");
        break;
    }
  };

  return (
    <div className="w-full bg-surface border border-slate-200 rounded-3xl p-6 shadow-sm mb-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-brand-500 rounded-2xl flex items-center justify-center text-white shadow-md shadow-brand-500/20">
          <Upload className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Import Members</h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Seamlessly transfer your members from any system</p>
        </div>
      </div>

      {/* Horizontal Steps */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 relative">
        {steps.map((s, index) => {
          const Icon = s.icon;
          const isActive = currentStep === s.id;
          const isCompleted = currentStep > s.id;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleStepClick(s.id)}
              title={`Go to Step ${s.id}: ${s.label}`}
              className="flex flex-col items-center text-center relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40 rounded-2xl p-1 transition-all"
            >
              {/* Connector line for large screens */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-7 left-[60%] right-[-40%] h-[2px] bg-slate-200 z-0 pointer-events-none">
                  <div
                    className="h-full bg-brand-500 transition-all duration-300"
                    style={{ width: isCompleted ? "100%" : "0%" }}
                  />
                </div>
              )}

              {/* Icon Circle */}
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all relative z-10 group-hover:scale-110 group-hover:shadow-md ${
                  isActive
                    ? "bg-brand-50 border-brand-500 text-brand-600 shadow-md shadow-brand-500/10 scale-105"
                    : isCompleted
                    ? "bg-emerald-50 border-emerald-500 text-emerald-600 group-hover:border-emerald-600"
                    : "bg-slate-50 border-slate-200 text-slate-400 group-hover:border-brand-400 group-hover:text-brand-500"
                }`}
              >
                <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
              </div>

              {/* Labels */}
              <div className="mt-3 space-y-0.5">
                <p
                  className={`text-xs font-bold transition-colors ${
                    isActive ? "text-brand-600 font-extrabold" : isCompleted ? "text-emerald-700 group-hover:text-emerald-800" : "text-slate-500 group-hover:text-brand-600"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[10px] text-slate-400 font-medium leading-tight max-w-[120px] mx-auto">
                  {s.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
