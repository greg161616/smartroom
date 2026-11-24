export type Device = {id:string;name:string;last_seen:string|null};
export type Relay = {id:string;device_id:string;channel:number;name:string;actual_state:boolean|null;updated_at:string|null};
export type Settings = {device_id:string;gesture_enabled:boolean;mode:'wave'|'presence'|'toggle';distance_cm:number;hold_ms:number};
export type Command = {id:string;relay_id:string;desired_state:boolean;status:'pending'|'applied'|'failed'|'expired';created_at:string;expires_at:string};
export type Schedule = {id:string;relay_id:string;desired_state:boolean;run_at:string;enabled:boolean};
export type Log = {id:string;device_id:string;message:string;created_at:string};
export type Room = {id:string;name:string};
