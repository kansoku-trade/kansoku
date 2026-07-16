// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CREDITS } from "../../../../shared/credits";
import { AboutPage } from "./AboutPage";

afterEach(cleanup);

describe("AboutPage", () => {
  it("renders name, version, license summary, and credits count", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "Kansoku" })).toBeTruthy();
    expect(screen.getByText(`版本 ${__APP_VERSION__}`)).toBeTruthy();
    expect(screen.getByText("查看完整许可证文本")).toBeTruthy();
    expect(screen.getByText(`共 ${CREDITS.length} 个组件`)).toBeTruthy();
  });
});
