import type { DocumentationReference } from "@/types/workflow";

export const aiModes = ["Explain", "Review", "Build", "Debug", "Teach"] as const;
export const aiProviderIds = ["mock", "openrouter", "nvidia", "openai", "azure"] as const;
export type AiProviderId = typeof aiProviderIds[number];
export type AiMode = typeof aiModes[number];
export type AiInstructionProfile = "workflow-builder";
export interface AiRequest { mode: AiMode; message: string; context: string; consent: true; provider?: AiProviderId; instructionProfile?: AiInstructionProfile }
export interface AiResponse { provider: string; answer: string; sources: DocumentationReference[]; mock: boolean }
export interface AiProvider { sendMessage(request: AiRequest): Promise<AiResponse> }
export interface ProviderStatus { id: AiProviderId | null; provider: string; configured: boolean; mock: boolean }
export interface ProviderCatalog extends ProviderStatus { providers: ProviderStatus[] }
