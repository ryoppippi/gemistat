import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import protobuf from 'protobufjs'

// Helper function to check if content is text-based
function isTextContent(contentType) {
  // If no content-type, let content check decide
  if (!contentType) return true
  
  const contentTypeLower = contentType.toLowerCase()
  
  // Explicitly text types
  const textTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/x-www-form-urlencoded',
    'application/graphql',
    'application/ld+json',
    'application/xhtml+xml',
    'text/event-stream' // Server-sent events (often used for streaming)
  ]
  
  // Binary types to explicitly exclude
  const binaryTypes = [
    'image/',
    'video/',
    'audio/',
    'application/octet-stream',
    'application/wasm',
    'application/pdf',
    'application/zip',
    'application/gzip',
    'application/binary',
    'font/',
    'application/protobuf'
  ]
  
  // Check if it's explicitly binary first
  if (binaryTypes.some(type => contentTypeLower.includes(type))) {
    return false
  }
  
  // Check if it's text
  return textTypes.some(type => contentTypeLower.includes(type))
}

// Helper function to check if a string contains binary data
function containsBinaryData(str) {
  if (!str) return false
  
  // Check for null bytes or other control characters that shouldn't be in text
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // Null byte or other problematic control characters
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      return true
    }
  }
  
  return false
}

// Helper function to extract token usage and model info from Gemini API responses
function extractUsageAndModelInfo(bodyContent) {
  if (!bodyContent) return null
  
  try {
    // Handle streaming responses (data: {...})
    const lines = bodyContent.split('\n').filter(line => line.trim())
    let usageData = null
    let modelVersion = null
    
    // Look through all lines to find the one with the most complete usageMetadata
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonData = JSON.parse(line.substring(6))
          if (jsonData.response) {
            // Extract model version
            if (jsonData.response.modelVersion) {
              modelVersion = jsonData.response.modelVersion
            }
            
            // Extract usage metadata
            if (jsonData.response.usageMetadata) {
              const metadata = jsonData.response.usageMetadata
              // Prefer metadata that has totalTokenCount or promptTokenCount
              if (metadata.totalTokenCount || metadata.promptTokenCount) {
                usageData = metadata
                // Don't break here, continue to find the most complete one
              } else if (!usageData) {
                // Keep partial metadata as fallback
                usageData = metadata
              }
            }
          }
        } catch (e) {
          // Continue to next line if JSON parsing fails
        }
      }
    }
    
    // If not streaming, try to parse as regular JSON
    if (!usageData || !modelVersion) {
      try {
        const jsonData = JSON.parse(bodyContent)
        if (jsonData.response) {
          if (!usageData && jsonData.response.usageMetadata) {
            usageData = jsonData.response.usageMetadata
          }
          if (!modelVersion && jsonData.response.modelVersion) {
            modelVersion = jsonData.response.modelVersion
          }
        } else {
          if (!usageData && jsonData.usageMetadata) {
            usageData = jsonData.usageMetadata
          }
          if (!modelVersion && jsonData.modelVersion) {
            modelVersion = jsonData.modelVersion
          }
        }
      } catch (e) {
        // Not valid JSON
      }
    }
    
    return {
      usageData,
      modelVersion
    }
  } catch (error) {
    return null
  }
}

// LiteLLM pricing API URL
const LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

// Cache for pricing data
let pricingCache = null

// Function to fetch pricing data from LiteLLM
async function fetchPricingData() {
  if (pricingCache) return pricingCache
  
  try {
    const response = await fetch(LITELLM_PRICING_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing data: ${response.statusText}`)
    }
    
    const data = await response.json()
    const pricing = new Map()
    
    // Parse and filter for valid pricing data
    for (const [modelName, modelData] of Object.entries(data)) {
      if (typeof modelData === 'object' && modelData !== null) {
        // Simple validation for required fields
        if (typeof modelData.input_cost_per_token === 'number' || 
            typeof modelData.output_cost_per_token === 'number') {
          pricing.set(modelName, {
            input_cost_per_token: modelData.input_cost_per_token,
            output_cost_per_token: modelData.output_cost_per_token,
            cache_creation_input_token_cost: modelData.cache_creation_input_token_cost,
            cache_read_input_token_cost: modelData.cache_read_input_token_cost,
            max_tokens: modelData.max_tokens,
            max_input_tokens: modelData.max_input_tokens,
            max_output_tokens: modelData.max_output_tokens
          })
        }
      }
    }
    
    pricingCache = pricing
    return pricing
  } catch (error) {
    console.error('Failed to fetch pricing data from LiteLLM:', error)
    // Fallback to hardcoded Gemini pricing
    return getFallbackGeminiPricing()
  }
}

// Fallback pricing for Gemini models
function getFallbackGeminiPricing() {
  const fallbackPricing = new Map([
    ['gemini-2.5-pro', {
      input_cost_per_token: 3.50 / 1_000_000,   // $3.50 per 1M tokens
      output_cost_per_token: 10.50 / 1_000_000  // $10.50 per 1M tokens
    }],
    ['gemini-2.5-flash', {
      input_cost_per_token: 0.075 / 1_000_000,  // $0.075 per 1M tokens
      output_cost_per_token: 0.30 / 1_000_000   // $0.30 per 1M tokens
    }],
    ['gemini-1.5-pro', {
      input_cost_per_token: 3.50 / 1_000_000,
      output_cost_per_token: 10.50 / 1_000_000
    }],
    ['gemini-1.5-flash', {
      input_cost_per_token: 0.075 / 1_000_000,
      output_cost_per_token: 0.30 / 1_000_000
    }]
  ])
  
  pricingCache = fallbackPricing
  return fallbackPricing
}

// Function to find model pricing with flexible matching
async function getModelPricing(modelVersion) {
  const pricing = await fetchPricingData()
  
  // Direct match
  const directMatch = pricing.get(modelVersion)
  if (directMatch) return directMatch
  
  // Try with provider prefix variations for Gemini
  const variations = [
    modelVersion,
    `google/${modelVersion}`,
    `vertex_ai/${modelVersion}`,
    `gemini/${modelVersion}`
  ]
  
  for (const variant of variations) {
    const match = pricing.get(variant)
    if (match) return match
  }
  
  // Try to find partial matches (e.g., "gemini-2.5-pro" might match "gemini-2.5-pro-20250115")
  const lowerModel = modelVersion.toLowerCase()
  for (const [key, value] of pricing) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.includes('gemini') && (
      lowerModel.includes(lowerKey) || lowerKey.includes(lowerModel)
    )) {
      return value
    }
  }
  
  return null
}

// Function to calculate cost based on token usage and model
async function calculateCost(usageData, modelVersion) {
  if (!usageData || !modelVersion) return null
  
  const pricing = await getModelPricing(modelVersion)
  if (!pricing) return null
  
  const promptTokens = usageData.promptTokenCount || 0
  const candidatesTokens = usageData.candidatesTokenCount || 0
  const thoughtsTokens = usageData.thoughtsTokenCount || 0
  const cachedTokens = usageData.cachedContentTokenCount || 0
  
  let inputCost = 0
  let outputCost = 0
  let thoughtsCost = 0
  let cacheCost = 0
  
  // Calculate input cost
  if (pricing.input_cost_per_token != null) {
    inputCost = promptTokens * pricing.input_cost_per_token
  }
  
  // Calculate output cost (candidates tokens)
  if (pricing.output_cost_per_token != null) {
    outputCost = candidatesTokens * pricing.output_cost_per_token
  }
  
  // Calculate thoughts cost (internal reasoning tokens - also charged as output)
  if (pricing.output_cost_per_token != null) {
    thoughtsCost = thoughtsTokens * pricing.output_cost_per_token
  }
  
  // Calculate cache cost (if available)
  if (cachedTokens > 0 && pricing.cache_read_input_token_cost != null) {
    cacheCost = cachedTokens * pricing.cache_read_input_token_cost
  }
  
  const totalCost = inputCost + outputCost + thoughtsCost + cacheCost
  
  return {
    modelVersion,
    inputCost,
    outputCost,
    thoughtsCost,
    cacheCost,
    totalCost,
    currency: 'USD'
  }
}

// Function to attempt protobuf decoding of binary data
function attemptProtobufDecoding(binaryData, url) {
  const debug = (msg) => {
    console.log(msg)
    return msg + '\n'
  }
  
  let debugLog = ''
  try {
    debugLog += debug(`[DEBUG] Attempting protobuf decode for ${url}`)
    debugLog += debug(`[DEBUG] Binary data type: ${typeof binaryData}, length: ${binaryData?.length || 'unknown'}`)
    
    // Convert binary data to Uint8Array if needed
    let buffer
    if (typeof binaryData === 'string') {
      console.log(`[DEBUG] Processing string data, first 100 chars: ${binaryData.substring(0, 100)}`)
      // Try to decode as base64 or binary string
      try {
        buffer = new Uint8Array(atob(binaryData).split('').map(c => c.charCodeAt(0)))
        console.log(`[DEBUG] Successfully decoded as base64, buffer length: ${buffer.length}`)
      } catch {
        buffer = new Uint8Array(binaryData.split('').map(c => c.charCodeAt(0)))
        console.log(`[DEBUG] Decoded as binary string, buffer length: ${buffer.length}`)
      }
    } else if (binaryData instanceof ArrayBuffer) {
      buffer = new Uint8Array(binaryData)
      console.log(`[DEBUG] Using ArrayBuffer, buffer length: ${buffer.length}`)
    } else {
      buffer = binaryData
      console.log(`[DEBUG] Using data as-is, type: ${typeof buffer}`)
    }

    // Simple protobuf decoding attempt
    const reader = protobuf.Reader.create(buffer)
    const decoded = {}
    
    console.log(`[DEBUG] Created protobuf reader, length: ${reader.len}`)
    
    while (reader.pos < reader.len) {
      const tag = reader.uint32()
      const wireType = tag & 7
      const fieldNumber = tag >>> 3
      
      console.log(`[DEBUG] Processing field ${fieldNumber}, wire type ${wireType}`)
      
      try {
        switch (wireType) {
          case 0: // Varint
            decoded[`field_${fieldNumber}`] = reader.uint64()
            console.log(`[DEBUG] Field ${fieldNumber}: varint ${decoded[`field_${fieldNumber}`]}`)
            break
          case 1: // Fixed64
            decoded[`field_${fieldNumber}`] = reader.fixed64()
            console.log(`[DEBUG] Field ${fieldNumber}: fixed64 ${decoded[`field_${fieldNumber}`]}`)
            break
          case 2: // Length-delimited
            const length = reader.uint32()
            const data = reader.buf.slice(reader.pos, reader.pos + length)
            reader.pos += length
            
            console.log(`[DEBUG] Field ${fieldNumber}: length-delimited, length ${length}`)
            
            // Try to decode as string first
            try {
              const str = new TextDecoder().decode(data)
              console.log(`[DEBUG] Field ${fieldNumber}: decoded as string: ${str.substring(0, 200)}`)
              if (str.includes('{') && str.includes('}')) {
                // Looks like JSON
                try {
                  decoded[`field_${fieldNumber}`] = JSON.parse(str)
                  console.log(`[DEBUG] Field ${fieldNumber}: parsed as JSON`)
                } catch {
                  decoded[`field_${fieldNumber}`] = str
                }
              } else {
                decoded[`field_${fieldNumber}`] = str
              }
            } catch {
              // If not valid text, store as hex
              decoded[`field_${fieldNumber}`] = Array.from(data)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(' ')
              console.log(`[DEBUG] Field ${fieldNumber}: stored as hex`)
            }
            break
          case 5: // Fixed32
            decoded[`field_${fieldNumber}`] = reader.fixed32()
            console.log(`[DEBUG] Field ${fieldNumber}: fixed32 ${decoded[`field_${fieldNumber}`]}`)
            break
          default:
            // Skip unknown wire types
            console.log(`[DEBUG] Skipping unknown wire type ${wireType}`)
            reader.skipType(wireType)
        }
      } catch (error) {
        console.log(`[DEBUG] Error processing field ${fieldNumber}: ${error.message}`)
        // If we can't decode this field, skip it
        break
      }
    }
    
    console.log(`[DEBUG] Protobuf decode complete, found ${Object.keys(decoded).length} fields`)
    return decoded
  } catch (error) {
    console.log(`[DEBUG] Protobuf decoding failed: ${error.message}`)
    return { error: `Protobuf decoding failed: ${error.message}` }
  }
}

// Function to extract token usage from decoded protobuf or JSON
function extractTokenUsageFromDecoded(decoded, url) {
  if (!decoded) return null
  
  console.log(`[DEBUG] Searching for token usage in decoded data:`, Object.keys(decoded))
  
  // Search through all fields for token-related data
  for (const [key, value] of Object.entries(decoded)) {
    console.log(`[DEBUG] Checking field ${key}, type: ${typeof value}`)
    
    if (typeof value === 'object' && value !== null) {
      // Check if this looks like usage metadata
      if (value.promptTokenCount || value.candidatesTokenCount || value.totalTokenCount) {
        console.log(`[DEBUG] Found usage metadata in field ${key}:`, value)
        return {
          usageData: value,
          modelVersion: decoded.modelVersion || null
        }
      }
      
      // For protobuf, check if the field contains JSON string with token counts
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          if (parsed.promptTokenCount || parsed.candidatesTokenCount || parsed.totalTokenCount) {
            console.log(`[DEBUG] Found usage metadata in JSON string field ${key}:`, parsed)
            return {
              usageData: parsed,
              modelVersion: decoded.modelVersion || parsed.modelVersion || null
            }
          }
        } catch (e) {
          // Not JSON, continue
        }
      }
      
      // Recursive search
      const nested = extractTokenUsageFromDecoded(value)
      if (nested) return nested
    }
    
    // Check for token-related field names
    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('usage')) {
      console.log(`[DEBUG] Found token-related field ${key}:`, value)
      if (typeof value === 'object') {
        return { usageData: value, modelVersion: decoded.modelVersion || null }
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          console.log(`[DEBUG] Parsed token field as JSON:`, parsed)
          return { usageData: parsed, modelVersion: decoded.modelVersion || null }
        } catch (e) {
          // Not JSON
        }
      }
    }
  }
  
  console.log(`[DEBUG] No token usage found in decoded data`)
  return null
}

const logFile = join(process.cwd(), 'gemini.log')

// Initialize the log file
writeFileSync(logFile, `=== Network Inspection Log Started at ${new Date().toISOString()} ===\n`)

// Create interceptors for different network APIs
const clientRequestInterceptor = new ClientRequestInterceptor()
const xmlHttpRequestInterceptor = new XMLHttpRequestInterceptor()
const fetchInterceptor = new FetchInterceptor()

async function logRequest(request, source) {
  // Skip LiteLLM pricing API requests
  if (request.url && request.url.includes('litellm')) {
    return
  }
  
  const timestamp = new Date().toISOString()
  let logEntry = `[${timestamp}] ${source} ${request.method} ${request.url}\n`
  
  // Log headers if present
  if (request.headers) {
    const headers = Object.entries(request.headers)
      .map(([key, value]) => `  ${key}: ${value}`)
      .join('\n')
    if (headers) {
      logEntry += `  Headers:\n${headers}\n`
    }
  }
  
  // Log request body if present and is text content
  if (request.body) {
    const contentType = request.headers['content-type'] || request.headers['Content-Type']
    
    if (isTextContent(contentType)) {
      try {
        let bodyContent = ''
        if (typeof request.body === 'string') {
          bodyContent = request.body
        } else if (request.body instanceof ArrayBuffer) {
          bodyContent = new TextDecoder().decode(request.body)
        } else if (request.body && typeof request.body.text === 'function') {
          bodyContent = await request.body.text()
        } else {
          bodyContent = String(request.body)
        }
        
        if (bodyContent && !containsBinaryData(bodyContent)) {
          logEntry += `  Request Body:\n${bodyContent}\n`
        } else if (bodyContent) {
          logEntry += `  Request Body: [Binary data detected]\n`
        }
      } catch (error) {
        logEntry += `  Request Body: [Error reading body: ${error.message}]\n`
      }
    } else {
      logEntry += `  Request Body: [Binary content - ${contentType}]\n`
    }
  }
  
  logEntry += '\n'
  
  try {
    appendFileSync(logFile, logEntry)
  } catch (error) {
    console.error('Failed to write to gemini.log:', error)
  }
}

async function logResponse(response, source) {
  // Skip LiteLLM pricing API responses
  if (response.url && response.url.includes('litellm')) {
    return
  }
  
  const timestamp = new Date().toISOString()
  let logEntry = `[${timestamp}] ${source} Response ${response.status} ${response.statusText}\n`
  
  // Log response headers if present
  if (response.headers) {
    const headers = Object.entries(response.headers)
      .map(([key, value]) => `  ${key}: ${value}`)
      .join('\n')
    if (headers) {
      logEntry += `  Headers:\n${headers}\n`
    }
  }
  
  // Log response body if present and is text content
  const contentType = response.headers['content-type'] || response.headers['Content-Type']
  
  // Special handling for countTokens API responses
  const isCountTokensRequest = (response.url && response.url.includes('countTokens')) ||
                               (response.request && response.request.url && response.request.url.includes('countTokens'))
  
  if (isTextContent(contentType) || isCountTokensRequest) {
    try {
      let bodyContent = ''
      
      // Try to clone the response first (works for fetch responses)
      if (typeof response.clone === 'function') {
        const clonedResponse = response.clone()
        bodyContent = await clonedResponse.text()
      } else if (typeof response.body === 'string') {
        bodyContent = response.body
      } else if (response.body instanceof ArrayBuffer) {
        bodyContent = new TextDecoder().decode(response.body)
      } else if (response.body instanceof ReadableStream) {
        // For streams that can't be cloned, just note the type
        bodyContent = '[ReadableStream - cannot log content without consuming stream]'
      } else if (response.body) {
        bodyContent = String(response.body)
      }
      
      if (bodyContent && !containsBinaryData(bodyContent)) {
        // Extract token usage and model info from Gemini API responses
        const usageAndModelInfo = extractUsageAndModelInfo(bodyContent)
        if (usageAndModelInfo && usageAndModelInfo.usageData) {
          const { usageData, modelVersion } = usageAndModelInfo
          
          logEntry += `  🔥 TOKEN USAGE:\n`
          logEntry += `    Prompt Tokens: ${usageData.promptTokenCount || 0}\n`
          logEntry += `    Candidates Tokens: ${usageData.candidatesTokenCount || 0}\n`
          logEntry += `    Total Tokens: ${usageData.totalTokenCount || 0}\n`
          if (usageData.thoughtsTokenCount) {
            logEntry += `    Thoughts Tokens: ${usageData.thoughtsTokenCount}\n`
          }
          if (usageData.cachedContentTokenCount) {
            logEntry += `    Cached Content Tokens: ${usageData.cachedContentTokenCount}\n`
          }
          if (modelVersion) {
            logEntry += `    Model: ${modelVersion}\n`
          }
          
          // Calculate and display cost information
          try {
            const costInfo = await calculateCost(usageData, modelVersion)
            if (costInfo) {
              logEntry += `  💰 COST ESTIMATE:\n`
              logEntry += `    Input Cost: $${costInfo.inputCost.toFixed(6)}\n`
              logEntry += `    Output Cost: $${costInfo.outputCost.toFixed(6)}\n`
              if (costInfo.thoughtsCost > 0) {
                logEntry += `    Thoughts Cost: $${costInfo.thoughtsCost.toFixed(6)}\n`
              }
              if (costInfo.cacheCost > 0) {
                logEntry += `    Cache Cost: $${costInfo.cacheCost.toFixed(6)}\n`
              }
              logEntry += `    Total Cost: $${costInfo.totalCost.toFixed(6)}\n`
            }
          } catch (error) {
            console.error('Failed to calculate cost:', error)
          }
          
          logEntry += `\n`
        }
        
        logEntry += `  Response Body:\n${bodyContent}\n`
      } else if (bodyContent) {
        // Show binary data for Gemini API endpoints (but truncated)
        const isGeminiAPI = response.url && (
          response.url.includes('countTokens') ||
          response.url.includes('generateContent') ||
          response.url.includes('googleapis.com')
        )
        
        if (isGeminiAPI) {
          // Check if this is likely a countTokens endpoint (binary response)
          const isCountTokens = response.url.includes('countTokens')
          
          if (isCountTokens) {
            // Try to decode as protobuf for countTokens
            const decoded = attemptProtobufDecoding(bodyContent, response.url)
            
            if (decoded && !decoded.error) {
              logEntry += `  Response Body: [Protobuf decoded - countTokens]\n`
              logEntry += JSON.stringify(decoded, null, 2) + '\n'
              
              // Try to extract token usage from decoded data
              const tokenInfo = extractTokenUsageFromDecoded(decoded, response.url)
              if (tokenInfo && tokenInfo.usageData) {
                const { usageData, modelVersion } = tokenInfo
                
                logEntry += `  🔥 TOKEN USAGE (from protobuf):\n`
                logEntry += `    Prompt Tokens: ${usageData.promptTokenCount || 0}\n`
                logEntry += `    Candidates Tokens: ${usageData.candidatesTokenCount || 0}\n`
                logEntry += `    Total Tokens: ${usageData.totalTokenCount || 0}\n`
                if (usageData.thoughtsTokenCount) {
                  logEntry += `    Thoughts Tokens: ${usageData.thoughtsTokenCount}\n`
                }
                if (usageData.cachedContentTokenCount) {
                  logEntry += `    Cached Content Tokens: ${usageData.cachedContentTokenCount}\n`
                }
                if (modelVersion) {
                  logEntry += `    Model: ${modelVersion}\n`
                }
              
              // Calculate and display cost information
              try {
                const costInfo = await calculateCost(usageData, modelVersion)
                if (costInfo) {
                  logEntry += `  💰 COST ESTIMATE (from protobuf):\n`
                  logEntry += `    Input Cost: $${costInfo.inputCost.toFixed(6)}\n`
                  logEntry += `    Output Cost: $${costInfo.outputCost.toFixed(6)}\n`
                  if (costInfo.thoughtsCost > 0) {
                    logEntry += `    Thoughts Cost: $${costInfo.thoughtsCost.toFixed(6)}\n`
                  }
                  if (costInfo.cacheCost > 0) {
                    logEntry += `    Cache Cost: $${costInfo.cacheCost.toFixed(6)}\n`
                  }
                  logEntry += `    Total Cost: $${costInfo.totalCost.toFixed(6)}\n`
                }
              } catch (error) {
                console.error('Failed to calculate cost from protobuf:', error)
              }
              
              logEntry += `\n`
            }
          } else {
            // For non-countTokens Gemini endpoints, try protobuf decode as fallback
            const decoded = attemptProtobufDecoding(bodyContent, response.url)
            
            if (decoded && !decoded.error) {
              logEntry += `  Response Body: [Protobuf decoded - ${response.url.includes('generateContent') ? 'generateContent' : 'Gemini API'}]\n`
              logEntry += JSON.stringify(decoded, null, 2) + '\n'
              
              // Try to extract token usage from decoded data
              const tokenInfo = extractTokenUsageFromDecoded(decoded, response.url)
              if (tokenInfo && tokenInfo.usageData) {
                const { usageData, modelVersion } = tokenInfo
                
                logEntry += `  🔥 TOKEN USAGE (from protobuf fallback):\n`
                logEntry += `    Prompt Tokens: ${usageData.promptTokenCount || 0}\n`
                logEntry += `    Candidates Tokens: ${usageData.candidatesTokenCount || 0}\n`
                logEntry += `    Total Tokens: ${usageData.totalTokenCount || 0}\n`
                if (usageData.thoughtsTokenCount) {
                  logEntry += `    Thoughts Tokens: ${usageData.thoughtsTokenCount}\n`
                }
                if (usageData.cachedContentTokenCount) {
                  logEntry += `    Cached Content Tokens: ${usageData.cachedContentTokenCount}\n`
                }
                if (modelVersion) {
                  logEntry += `    Model: ${modelVersion}\n`
                }
                
                // Calculate and display cost information
                try {
                  const costInfo = await calculateCost(usageData, modelVersion)
                  if (costInfo) {
                    logEntry += `  💰 COST ESTIMATE (from protobuf fallback):\n`
                    logEntry += `    Input Cost: $${costInfo.inputCost.toFixed(6)}\n`
                    logEntry += `    Output Cost: $${costInfo.outputCost.toFixed(6)}\n`
                    if (costInfo.thoughtsCost > 0) {
                      logEntry += `    Thoughts Cost: $${costInfo.thoughtsCost.toFixed(6)}\n`
                    }
                    if (costInfo.cacheCost > 0) {
                      logEntry += `    Cache Cost: $${costInfo.cacheCost.toFixed(6)}\n`
                    }
                    logEntry += `    Total Cost: $${costInfo.totalCost.toFixed(6)}\n`
                  }
                } catch (error) {
                  console.error('Failed to calculate cost:', error)
                }
                
                logEntry += `\n`
              }
            } else {
              const preview = bodyContent.length > 500 ? 
                bodyContent.substring(0, 500) + '...[truncated]' : 
                bodyContent
              logEntry += `  Response Body: [Binary data - Gemini API]\n${preview}\n`
              if (decoded && decoded.error) {
                logEntry += `  Protobuf decode error: ${decoded.error}\n`
              }
            }
          }
        } else {
          logEntry += `  Response Body: [Binary data detected]\n`
        }
      }
      }
    } catch (error) {
      logEntry += `  Response Body: [Error reading body: ${error.message}]\n`
    }
  } else {
    // Show content type and try to read body for Gemini APIs even if marked as binary
    const isGeminiAPI = response.url && (
      response.url.includes('countTokens') ||
      response.url.includes('generateContent') ||
      response.url.includes('googleapis.com')
    )
    
    if (isGeminiAPI) {
      logEntry += `  Response Body: [Gemini API - ${contentType}]\n`
      try {
        let bodyContent = ''
        if (typeof response.clone === 'function') {
          const clonedResponse = response.clone()
          bodyContent = await clonedResponse.arrayBuffer()
        } else if (response.body) {
          bodyContent = response.body
        }
        
        if (bodyContent) {
          // Try protobuf decoding first
          const decoded = attemptProtobufDecoding(bodyContent, response.url)
          
          if (decoded && !decoded.error) {
            logEntry += `[Protobuf decoded]\n`
            logEntry += JSON.stringify(decoded, null, 2) + '\n'
            
            // Try to extract token usage from decoded data
            const tokenInfo = extractTokenUsageFromDecoded(decoded, response.url)
            if (tokenInfo && tokenInfo.usageData) {
              const { usageData, modelVersion } = tokenInfo
              
              logEntry += `🔥 TOKEN USAGE (from binary protobuf):\n`
              logEntry += `  Prompt Tokens: ${usageData.promptTokenCount || 0}\n`
              logEntry += `  Candidates Tokens: ${usageData.candidatesTokenCount || 0}\n`
              logEntry += `  Total Tokens: ${usageData.totalTokenCount || 0}\n`
              if (usageData.thoughtsTokenCount) {
                logEntry += `  Thoughts Tokens: ${usageData.thoughtsTokenCount}\n`
              }
              if (usageData.cachedContentTokenCount) {
                logEntry += `  Cached Content Tokens: ${usageData.cachedContentTokenCount}\n`
              }
              if (modelVersion) {
                logEntry += `  Model: ${modelVersion}\n`
              }
              
              // Calculate and display cost information
              try {
                const costInfo = await calculateCost(usageData, modelVersion)
                if (costInfo) {
                  logEntry += `💰 COST ESTIMATE (from binary protobuf):\n`
                  logEntry += `  Input Cost: $${costInfo.inputCost.toFixed(6)}\n`
                  logEntry += `  Output Cost: $${costInfo.outputCost.toFixed(6)}\n`
                  if (costInfo.thoughtsCost > 0) {
                    logEntry += `  Thoughts Cost: $${costInfo.thoughtsCost.toFixed(6)}\n`
                  }
                  if (costInfo.cacheCost > 0) {
                    logEntry += `  Cache Cost: $${costInfo.cacheCost.toFixed(6)}\n`
                  }
                  logEntry += `  Total Cost: $${costInfo.totalCost.toFixed(6)}\n`
                }
              } catch (error) {
                console.error('Failed to calculate cost from binary protobuf:', error)
              }
              
              logEntry += `\n`
            }
          } else {
            // Fallback to hex dump or text
            if (bodyContent instanceof ArrayBuffer) {
              const bytes = new Uint8Array(bodyContent)
              const preview = Array.from(bytes.slice(0, 100))
                .map(b => b.toString(16).padStart(2, '0'))
                .join(' ')
              logEntry += `[Binary data - first 100 bytes]: ${preview}${bytes.length > 100 ? '...' : ''}\n`
            } else {
              const preview = String(bodyContent).length > 500 ? 
                String(bodyContent).substring(0, 500) + '...[truncated]' : 
                String(bodyContent)
              logEntry += `${preview}\n`
            }
            
            if (decoded && decoded.error) {
              logEntry += `Protobuf decode error: ${decoded.error}\n`
            }
          }
        }
      } catch (error) {
        logEntry += `  [Error reading Gemini API body: ${error.message}]\n`
      }
    } else {
      logEntry += `  Response Body: [Binary content - ${contentType}]\n`
    }
  }
  
  logEntry += '\n'
  
  try {
    appendFileSync(logFile, logEntry)
  } catch (error) {
    console.error('Failed to write to gemini.log:', error)
  }
}

// Set up ClientRequest interceptor (for http/https modules)
clientRequestInterceptor.on('request', ({ request }) => {
  logRequest(request, 'ClientRequest')
})

clientRequestInterceptor.on('response', ({ response }) => {
  logResponse(response, 'ClientRequest')
})

// Set up XMLHttpRequest interceptor
xmlHttpRequestInterceptor.on('request', ({ request }) => {
  logRequest(request, 'XMLHttpRequest')
})

xmlHttpRequestInterceptor.on('response', ({ response }) => {
  logResponse(response, 'XMLHttpRequest')
})

// Set up Fetch interceptor
fetchInterceptor.on('request', ({ request }) => {
  logRequest(request, 'Fetch')
})

fetchInterceptor.on('response', ({ response }) => {
  logResponse(response, 'Fetch')
})

// Apply all interceptors
clientRequestInterceptor.apply()
xmlHttpRequestInterceptor.apply()
fetchInterceptor.apply()

// Clean up on process exit
process.on('exit', () => {
  const timestamp = new Date().toISOString()
  appendFileSync(logFile, `=== Network Inspection Log Ended at ${timestamp} ===\n`)
  
  clientRequestInterceptor.dispose()
  xmlHttpRequestInterceptor.dispose()
  fetchInterceptor.dispose()
})

// Export empty object for ES module compatibility
export {}