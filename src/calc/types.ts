export type LayerStatus = 'active' | 'depleted';

export interface Layer {
  id: string;
  hold_id: string;
  cargo_lot_id: string;
  voyage_id: string;
  source_vessel: string;
  loaded_tons: number;
  remaining_tons: number;
  load_sequence: number;
  layer_status: LayerStatus;
}

export interface DischargeAllocation {
  operation_id: string;
  cargo_layer_id: string;
  cargo_lot_id: string;
  hold_id: string;
  source_vessel: string;
  discharged_tons: number;
}

export interface HoldCapacityInput {
  hold_volume_m3: number;
  sf: number;
  fill_percent: number;
}
