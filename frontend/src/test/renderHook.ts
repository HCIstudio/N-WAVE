// Render a hook in a test component and read its latest result. No JSX:
// src/test is outside the app tsconfig, so JSX here wouldn't compile.

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Calls the hook it is given and hands its result out. */
const Probe = <Props, Result>({
  hook,
  props,
  result,
}: {
  hook: (props: Props) => Result;
  props: Props;
  result: { current: Result };
}) => {
  result.current = hook(props);
  return null;
};

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
  const render = (props: Props) => {
    const probe = createElement(Probe<Props, Result>, { hook, props, result });
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
