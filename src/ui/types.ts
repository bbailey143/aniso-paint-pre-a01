import type { Recipe } from '../color/km';
import type { Paper } from '../substrate/papers';
import type { BrushDef } from '../brush/types';
import type { DryMedium } from '../media/types';

export type SettingsGroup = { heading: string; rows: Array<[string, string]> };

export interface PaletteEvents {
  onMixChange?(hex: string | null, recipe: Recipe, loading: number): void;
  onPaperChange?(paper: Paper): void;
  onEvapChange?(evapRate: number): void;
  onWaterChange?(waterCharge: number): void;
  onTiltChange?(gravityX: number, gravityY: number, cosAlpha: number): void;
  onClear?(): void;
  onWaterView?(on: boolean): void;
  onRinse?(): void;
  onRinseLoad?(): void;
  onBrushChange?(def: BrushDef, size: number): void;
  onDryMedium?(medium: DryMedium, size: number): void;
}
