import { MockAiProvider } from "./mock-provider";
import { OpenAiProvider, AzureOpenAiProvider, OpenRouterAiProvider, NvidiaAiProvider, azureResponsesEndpoint, isFreeOpenRouterModel, defaultOpenRouterModel } from "./providers";
import { aiProviderIds, type AiProvider, type AiProviderId, type ProviderCatalog, type ProviderStatus } from "./types";

export { MockAiProvider, OpenAiProvider, AzureOpenAiProvider, OpenRouterAiProvider, NvidiaAiProvider };
export { aiModes, aiProviderIds, type AiProviderId, type AiMode, type AiRequest, type AiResponse, type AiProvider, type ProviderStatus, type ProviderCatalog } from "./types";

export function getProviderStatus(selected?: AiProviderId): ProviderStatus {
  const choice = selected ?? (process.env.AI_PROVIDER ?? "mock").trim().toLowerCase();
  if (choice === "mock") return { id: "mock", provider: "MockAiProvider", configured: true, mock: true };
  if (choice === "openrouter") return { id: "openrouter", provider: "OpenRouter", configured: Boolean(process.env.OPENROUTER_API_KEY?.trim() && isFreeOpenRouterModel(process.env.OPENROUTER_MODEL?.trim() || defaultOpenRouterModel)), mock: false };
  if (choice === "nvidia") return { id: "nvidia", provider: "NVIDIA Build", configured: Boolean(process.env.NVIDIA_API_KEY?.trim()), mock: false };
  if (choice === "openai") return { id: "openai", provider: "OpenAI", configured: Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim()), mock: false };
  if (choice === "azure" || choice === "azure-openai") {
    let validEndpoint = false;
    try { azureResponsesEndpoint(process.env.AZURE_OPENAI_ENDPOINT ?? ""); validEndpoint = true; } catch { /* Status público não revela endpoints privados. */ }
    return { id: "azure", provider: "Azure OpenAI", configured: Boolean(validEndpoint && process.env.AZURE_OPENAI_API_KEY?.trim() && process.env.AZURE_OPENAI_DEPLOYMENT?.trim()), mock: false };
  }
  return { id: null, provider: "Provedor desconhecido", configured: false, mock: false };
}

export function getProviderCatalog(): ProviderCatalog {
  return { ...getProviderStatus(), providers: aiProviderIds.map((id) => getProviderStatus(id)) };
}

export function createAiProvider(selected?: AiProviderId): AiProvider {
  const status = getProviderStatus(selected);
  if (!status.configured) throw new Error("O provedor selecionado não está configurado no servidor.");
  if (status.mock) return new MockAiProvider();
  if (status.id === "openrouter") return new OpenRouterAiProvider({ apiKey: process.env.OPENROUTER_API_KEY ?? "", model: process.env.OPENROUTER_MODEL });
  if (status.id === "nvidia") return new NvidiaAiProvider({ apiKey: process.env.NVIDIA_API_KEY ?? "", model: process.env.NVIDIA_MODEL });
  if (status.id === "openai") return new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY ?? "", model: process.env.OPENAI_MODEL ?? "" });
  return new AzureOpenAiProvider({ apiKey: process.env.AZURE_OPENAI_API_KEY ?? "", endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "", deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? "" });
}
