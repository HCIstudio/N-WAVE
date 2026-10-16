// Render a hook in a test component and read its latest result. No JSX:
// src/test is outside the app tsconfig, so JSX here wouldn't compile.

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export const renderHook = <Props, Result>(
  hook: (props: Props) => Result,
  options: {
    initialProps?: Props;
    wrapper?: (props: { children: ReactNode }) => ReactNode;
  } = {},
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = { current: undefined as Result };
  const Probe = ({ props }: { props: Props }) => {
    result.current = hook(props);
    return null;
  };
  const render = (props: Props) => {
    const probe = createElement(Probe, { props });
    act(() =>
      root.render(options.wrapper ? options.wrapper({ children: probe }) : probe),
    );
  };
  render(options.initialProps as Props);
  return {
    result,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

/** Let pending promises and the effects they trigger settle. */
export const flush = () => act(async () => {});
