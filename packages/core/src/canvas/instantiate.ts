const INJECTED = '__kansoku_canvas__';
const INJECTED_DATA = '__kansoku_canvas_data__';

export function instantiateCanvas(
  code: string,
  sdk: Record<string, unknown>,
  react: unknown,
  data: Record<string, unknown> = {},
): unknown {
  const factory = new Function(INJECTED, 'React', INJECTED_DATA, code);
  const exported = factory(sdk, react, data);
  if (typeof exported === 'function' || exported == null) return exported;
  return function GeneratedCanvas() {
    return exported;
  };
}
