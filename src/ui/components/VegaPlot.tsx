import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import vegaEmbed, { type EmbedOptions } from 'vega-embed';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error rendering VegaPlot:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-sm text-red-700">
            <h3 className="font-semibold mb-1">Failed to render plot</h3>
            <p className="text-xs font-mono">{this.state.error?.message}</p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

interface VegaPlotProps {
  spec: Record<string, any>;
  options?: EmbedOptions;
}

function VegaPlotInner({ spec, options }: VegaPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    let viewInstance: any = null;

    async function embed() {
      if (!containerRef.current) return;
      try {
        // Clean up any old view first
        if (viewRef.current) {
          viewRef.current.finalize();
          viewRef.current = null;
        }

        const res = await vegaEmbed(containerRef.current, spec, {
          actions: false,
          renderer: 'svg',
          ...options,
        });

        if (!active) {
          res.view.finalize();
        } else {
          viewInstance = res.view;
          viewRef.current = res.view;
        }
      } catch (err) {
        console.error('Error embedding Vega-Lite plot:', err);
      }
    }

    embed();

    return () => {
      active = false;
      if (viewInstance) {
        viewInstance.finalize();
      }
    };
  }, [spec, options]);

  return <div ref={containerRef} className="w-full h-full min-h-0 flex items-center justify-center [&_svg]:max-w-none" />;
}

export function VegaPlot(props: VegaPlotProps) {
  return (
    <ErrorBoundary>
      <VegaPlotInner {...props} />
    </ErrorBoundary>
  );
}
