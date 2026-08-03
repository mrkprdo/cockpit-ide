// specs-domain AI tools: explore/validate/reconcile/reload the SPECGEN graph
// (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import { GetCanvasStateArgs, ExploreSpecsMapArgs, SpecsReconcileArgs } from './schemas';

export const specsExploreTool: ToolDefinition<typeof ExploreSpecsMapArgs> = {
  name: 'specs_explore',
  description: 'Search the SPECGEN feature graph and return dense context per match: description, dependencies, referenced by, IPC, interface, depth-1 neighborhood, and downstream impact. Instant (no UI animation). Use this to orient before any code change instead of grepping specs.',
  parameters: ExploreSpecsMapArgs,
  execute: async (args, ctx) => {
    return await ctx.cockpit.exploreSpecsMap(args.query);
  },
};

export const specsValidateTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'specs_validate',
  description: 'Run the full SPECGEN validation rule catalog (unresolved/asymmetric edges, cycles, layer inversions, missing files, stub descriptions, export/IPC drift) against the spec graph and source tree. Returns a markdown report.',
  parameters: GetCanvasStateArgs,
  execute: async (_args, ctx) => {
    return await ctx.cockpit.validateSpecsMap();
  },
};

export const specsReconcileTool: ToolDefinition<typeof SpecsReconcileArgs> = {
  name: 'specs_reconcile',
  description: 'Sync structural spec fields from source code. Structural fields only — hand-written descriptions, Interface, State, Lifecycle, UI specs, and unknown sections are never modified. Recomputes all Referenced By sections globally. Replaces the old full-file regenerate.',
  parameters: SpecsReconcileArgs,
  execute: async (args, ctx) => {
    return await ctx.cockpit.reconcileSpecsMap(args.mode, args.create_skeletons ?? false);
  },
};

export const specsReloadTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'specs_reload',
  description: 'Reread the spec corpus from disk into the SpecsMap graph. Use after editing *.spec.md files directly.',
  parameters: GetCanvasStateArgs,
  execute: async (_args, ctx) => {
    return await ctx.cockpit.reloadSpecsMap();
  },
};
