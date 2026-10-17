// Hardware protocol registry — device apps register their own protocols
// (scale, scanner, terminal, display…) and the framework gives them a
// consistent registration + lookup surface.

export interface HardwareProtocol {
  code: string;
  name: string;
  kind: 'printer' | 'terminal' | 'display' | 'scanner' | 'custom';
}

const registry = new Map<string, HardwareProtocol>();

export function registerProtocol(protocol: HardwareProtocol): void {
  registry.set(protocol.code, protocol);
}

export function getProtocol(code: string): HardwareProtocol | undefined {
  return registry.get(code);
}

export function listProtocols(): HardwareProtocol[] {
  return [...registry.values()];
}
