export type VoyageStatus = 'open' | 'closed';

export interface Voyage {
  id: string;
  vessel_id: string;
  voyage_no: string;
  loading_port_id: string | null;
  discharging_port_id: string | null;
  status: VoyageStatus;
  arrived_at: string | null;
  nor_at: string | null;
  berthed_at: string | null;
  operations_started_at: string | null;
  operations_ended_at: string | null;
  departed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVoyageInput {
  vessel_id: string;
  voyage_no: string;
  loading_port_id?: string | null;
  discharging_port_id?: string | null;
}

export interface CargoLot {
  id: string;
  voyage_id: string;
  source_vessel: string;
  cargo_id: string;
  hold_id: string;
  protein_percent: number | null;
  sf: number;
  planned_tons: number;
  loaded_tons: number;
  bl_no: string | null;
  load_sequence: number;
  loaded_at: string;
}

export interface AddLotInput {
  voyage_id: string;
  source_vessel: string;
  cargo_id: string;
  hold_id: string;
  protein_percent?: number | null;
  sf: number;
  planned_tons: number;
  loaded_tons: number;
  bl_no?: string | null;
  loaded_at?: string;
}

export interface CargoLayerRow {
  id: string;
  cargo_lot_id: string;
  voyage_id: string;
  hold_id: string;
  source_vessel: string;
  loaded_tons: number;
  remaining_tons: number;
  load_sequence: number;
  layer_status: 'active' | 'depleted';
}

export interface AvailableBySource {
  source_vessel: string;
  remaining_tons: number;
}

export interface DischargeInput {
  voyage_id: string;
  hold_id: string;
  tons: number;
  event_date: string;
  time_from?: string | null;
  time_to?: string | null;
  description?: string | null;
}

export interface DischargeResult {
  operation_id: string;
  allocations: {
    cargo_layer_id: string;
    cargo_lot_id: string;
    source_vessel: string;
    discharged_tons: number;
  }[];
}
