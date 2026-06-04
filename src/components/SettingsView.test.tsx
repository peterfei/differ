import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "solid-testing-library";
import { SettingsView } from "./SettingsView";

// ── Mocks ──

const { mockGetSettings, mockUpdateSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

vi.mock("../lib/settings", () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

const DEFAULT_SETTINGS = {
  theme: "dark" as const,
  font_size: 13,
  font_family: "JetBrains Mono",
  watch_files: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
  mockUpdateSettings.mockImplementation(async (update: Partial<typeof DEFAULT_SETTINGS>) => ({
    ...DEFAULT_SETTINGS,
    ...update,
  }));
});

// ── Tests ──

describe("SettingsView", () => {
  it("renders without crashing and shows all sections", async () => {
    render(() => <SettingsView />);
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByText("主题")).toBeInTheDocument();
    expect(screen.getByText("字体")).toBeInTheDocument();
    expect(screen.getByText("键盘快捷键")).toBeInTheDocument();
  });

  it("reads settings on mount and applies theme to document", async () => {
    render(() => <SettingsView />);
    await vi.waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalled();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("SettingsView — font application", () => {
  it("applies font_family to document.documentElement when changed", async () => {
    render(() => <SettingsView />);

    // Wait for settings to load
    await vi.waitFor(() => {
      expect(screen.getByDisplayValue("JetBrains Mono")).toBeInTheDocument();
    });

    // Change font family to Fira Code
    const select = screen.getByDisplayValue("JetBrains Mono") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "Fira Code" } });

    // Assert: document element should have the font-family applied
    await vi.waitFor(() => {
      const fontFamily = document.documentElement.style.getPropertyValue("--font-mono");
      expect(fontFamily).toContain("Fira Code");
    });
  });

  it("applies font_size to document when changed", async () => {
    render(() => <SettingsView />);

    // Wait for settings to load
    await vi.waitFor(() => {
      expect(screen.getByText("13")).toBeInTheDocument();
    });

    // Change font size via slider
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();
    fireEvent.input(slider, { target: { value: "16" } });

    // Assert: document should have the font-size applied
    await vi.waitFor(() => {
      const fontSize = document.documentElement.style.getPropertyValue("--font-size-base");
      expect(fontSize).toBe("16px");
    });
  });
});

describe("SettingsView — theme application", () => {
  it("removes dark class when switching to light theme", async () => {
    render(() => <SettingsView />);

    // Wait for settings to load
    await vi.waitFor(() => {
      expect(screen.getByText("浅色")).toBeInTheDocument();
    });

    // Click light theme button
    fireEvent.click(screen.getByText("浅色"));

    // Assert: dark class should be removed from document element
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("adds dark class when switching to dark theme", async () => {
    // Start with light theme
    mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, theme: "light" });
    document.documentElement.classList.remove("dark");

    render(() => <SettingsView />);

    await vi.waitFor(() => {
      expect(screen.getByText("深色")).toBeInTheDocument();
    });

    // Click dark theme button
    fireEvent.click(screen.getByText("深色"));

    // Assert: dark class should be added
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});
