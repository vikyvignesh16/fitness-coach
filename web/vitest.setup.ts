import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest does not enable globals, so Testing Library cannot clean up after each test by itself.
afterEach(() => cleanup());
