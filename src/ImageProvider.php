<?php
declare(strict_types=1);

/**
 * Image Provider Interface for AI-generated product images.
 * Allows swapping between different AI image generation services.
 */
interface ImageProviderInterface
{
    /**
     * Generate an image from a text prompt.
     *
     * @param string $prompt The text prompt for image generation.
     * @return string URL or path to the generated image.
     * @throws ProviderException on failure.
     */
    public function generate(string $prompt): string;
}

/**
 * Exception thrown by image providers.
 */
class ProviderException extends RuntimeException {}

/**
 * OpenAI DALL-E 3 provider implementation.
 */
class OpenAIProvider implements ImageProviderInterface
{
    private string $apiKey;
    private string $orgId = '';
    private string $apiBase = 'https://api.openai.com/v1';

    public function __construct(string $apiKey, string $orgId = '')
    {
        $this->apiKey = $apiKey;
        $this->orgId = $orgId;
    }

    public function generate(string $prompt): string
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $this->apiBase . '/images/generations',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode([
                'model' => 'dall-e-3',
                'prompt' => $prompt,
                'n' => 1,
                'size' => '1024x1024',
                'response_format' => 'url',
                'quality' => 'standard',
                'style' => 'natural',
            ]),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiKey,
                ...($this->orgId ? ['OpenAI-Organization: ' . $this->orgId] : []),
            ],
            CURLOPT_TIMEOUT => 60,
        ]);

        $result = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($result === false) {
            throw new ProviderException('CURL error: ' . curl_error($ch));
        }
        curl_close($ch);

        $data = json_decode($result, true);
        if (json_last_error() !== JSON_ERROR_NONE || !isset($data['data'][0]['url'])) {
            throw new ProviderException('Invalid OpenAI response: ' . $result);
        }

        return $data['data'][0]['url'];
    }
}

/**
 * Stability AI provider stub (placeholder for future implementation).
 */
class StabilityProvider implements ImageProviderInterface
{
    private string $apiKey;
    private string $engineId = 'stable-diffusion-xl-1024-v1-0';

    public function __construct(string $apiKey, string $engineId = '')
    {
        $this->apiKey = $apiKey;
        if ($engineId !== '') {
            $this->engineId = $engineId;
        }
    }

    public function generate(string $prompt): string
    {
        // TODO: Implement Stability API call
        throw new ProviderException('Stability provider not yet implemented.');
    }
}

/**
 * Factory to create provider instances based on configuration.
 */
class ImageProviderFactory
{
    public static function create(string $type, array $config): ImageProviderInterface
    {
        return match (strtolower($type)) {
            'openai' => new OpenAIProvider(
                $config['api_key'],
                $config['org_id'] ?? ''
            ),
            'stability' => new StabilityProvider(
                $config['api_key'],
                $config['engine_id'] ?? ''
            ),
            default => throw new InvalidArgumentException("Unknown image provider type: {$type}")
        };
    }
}