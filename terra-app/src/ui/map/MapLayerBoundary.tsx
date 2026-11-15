import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface MapLayerBoundaryProps {
  /** Layer name, used in the console report and the hidden error marker. */
  name: string;
  children: ReactNode;
}

interface MapLayerBoundaryState {
  error: Error | null;
}

/**
 * Isolates one map layer (W7-F2-FU-1). If the layer throws while rendering or
 * in an effect, only that layer is removed from the tree; the map, the other
 * layers and the rest of the app stay mounted. The failure is reported to the
 * console and left as a hidden `[data-map-layer-error]` marker so harnesses
 * and tests can detect it.
 */
export class MapLayerBoundary extends Component<MapLayerBoundaryProps, MapLayerBoundaryState> {
  state: MapLayerBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): MapLayerBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[map layer "${this.props.name}"] failed and was removed; the app stays mounted.`, error, info.componentStack);
  }

  render() {
    if (this.state.error) return <span hidden data-map-layer-error={this.props.name} />;
    return this.props.children;
  }
}
