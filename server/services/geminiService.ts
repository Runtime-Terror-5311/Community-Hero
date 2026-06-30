/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This file integrates Google's modern @google/genai SDK on the server side
// to perform automatic image-based triage, categorization, validation, 
// and severity-scoring of reported infrastructure issues.

import { GoogleGenAI, Type } from "@google/genai";

// Initialize the Google Gen AI client with appropriate user agent
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  console.log(`[Gemini client config] Checking GEMINI_API_KEY environment variable. isDefined=${!!key}, length=${key ? key.length : 0}`);
  
  if (!aiClient) {
    if (key && key !== "MY_GEMINI_API_KEY" && key !== "YOUR_GEMINI_API_KEY" && !key.startsWith("YOUR_")) {
      console.log(`[Gemini client config] Initializing client with valid API key starting with "${key.substring(0, 5)}...".`);
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } else {
      console.warn(`[Gemini client config] GEMINI_API_KEY is not configured or is using a placeholder ("${key}"). Live AI analysis will be disabled.`);
    }
  }
  return aiClient;
}

export interface TriageResult {
  isValid: boolean;
  severityScore: number;
  verifiedCategory: 'pothole' | 'broken-streetlight' | 'water-leak' | 'trash' | 'other';
  rejectionReason?: string;
  confidenceScore: number;
  autoDescription?: string;
}

/**
 * /**
 * Triages an uploaded image to confirm if it constitutes a real infrastructure issue,
 * and extracts critical category + severity metadata.
 */
export async function triageIssueImage(base64Image: string, declaredCategory: string, userDescription: string): Promise<TriageResult> {
  const client = getGeminiClient();

  if (!client) {
    console.warn("GEMINI_API_KEY is not defined or is a placeholder. Using intelligent fallback auto-triage.");
    return fallbackTriage(declaredCategory, userDescription);
  }

  try {
    // Extract format and actual base64 content
    // standard: data:image/jpeg;base64,xxxx
    let mimeType = "image/jpeg";
    let data = "";

    if (base64Image.startsWith("http://") || base64Image.startsWith("https://")) {
      try {
        console.log(`Downloading preset template image on server: ${base64Image}`);
        const fetchRes = await fetch(base64Image);
        if (fetchRes.ok) {
          const contentType = fetchRes.headers.get("content-type");
          if (contentType) {
            mimeType = contentType;
          }
          const arrayBuffer = await fetchRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          data = buffer.toString("base64");
        } else {
          throw new Error(`Non-ok status downloading preset image: ${fetchRes.status}`);
        }
      } catch (err) {
        console.error("Failed to download template image on server, reverting to mock data placeholder:", err);
        return fallbackTriage(declaredCategory, userDescription);
      }
    } else {
      const matches = base64Image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        data = matches[2];
      } else {
        data = base64Image;
      }
    }


    // SYSTEM Instruction
    const systemInstruction = `
You are an AI Civic Infrastructure Verification Officer.

Your job is to verify infrastructure reports using ONLY visual evidence from the uploaded image.

CRITICAL RULES

1. The image is the primary source of truth.
2. User category and user remarks are secondary context only.
3. Never assume the reported category is correct.
4. Never infer damage that is not visually visible.
5. If visual evidence is insufficient, reject the report.
6. Confidence must be based only on what is visible in the image.
7. If image evidence contradicts the reported category, trust the image.

VERIFICATION PROCESS

STEP 1: IMAGE DESCRIPTION

Describe all major visible objects in the image.

Examples:

* road
* pavement
* pothole
* garbage
* water
* drain
* streetlight
* vehicle
* building
* tree
* person
* animal

STEP 2: ISSUE DETECTION

Determine whether any civic infrastructure issue is actually visible.

Valid infrastructure issues include:

* potholes
* road cracks
* damaged pavement
* broken streetlights
* exposed electrical infrastructure
* water leakage
* burst pipelines
* drainage overflow
* garbage accumulation
* illegal dumping
* damaged public property

STEP 3: RELEVANCE CHECK

If the image primarily contains any of the following:

* selfie
* person
* pet
* animal
* food
* indoor room
* document
* screenshot
* social media post
* chat screenshot
* meme
* random object
* product photo

return INVALID_REPORT immediately.

STEP 4: CATEGORY CLASSIFICATION

Choose exactly one:

* pothole
* broken-streetlight
* water-leak
* trash
* other
* unrelated

STEP 5: SEVERITY ASSESSMENT

0 = invalid report

1-3 = minor issue

4-6 = moderate issue

7-8 = serious issue

9-10 = critical public safety risk

STEP 6: CONFIDENCE

0-40 = weak evidence

41-70 = moderate evidence

71-90 = strong evidence

91-100 = extremely clear visual evidence

OUTPUT RULES

Return JSON only.

Required JSON format:

{
"actual_category": "",
"reported_category": "",
"match": false,
"severity": 0,
"confidence": 0,
"decision": "",
"reasoning": "",
"visible_objects": []
}

Decision must be one of:

* VALID_REPORT
* INVALID_REPORT
* NEEDS_MANUAL_REVIEW

If no visible infrastructure issue exists:

{
"actual_category":"unrelated",
"reported_category":"",
"match":false,
"severity":0,
"confidence":100,
"decision":"INVALID_REPORT",
"reasoning":"No visible civic infrastructure issue detected",
"visible_objects":[]
}

`;

    // USER Prompt
const userPromptText = `
Analyze the uploaded image.

Task:

1. List visible objects.
2. Determine if any infrastructure issue is visible.
3. Determine actual category.
4. Assign severity.
5. Return JSON only.

Reported Category:
${declaredCategory}

User Remarks:
${userDescription}

IMPORTANT:
Use category and remarks only after image inspection.
If image evidence contradicts them, ignore them.
`;
    console.log(`[Gemini client] Sending multimodal request to model "gemini-2.5-flash" with mimeType="${mimeType}", image base64 length=${data.length}.`);
  console.log("========== GEMINI REQUEST ==========");
console.log("Category:", declaredCategory);
console.log("Description:", userDescription);
console.log("Mime Type:", mimeType);
console.log("Image Length:", data.length);
if (!data || data.length < 100) {
  throw new Error(`Invalid image data. Length=${data.length}`);
}
console.log("====================================");
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: userPromptText
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: data
              }
            }
          ]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            actual_category: {
              type: Type.STRING,
              description: "The actual detected category of the issue: 'pothole', 'broken-streetlight', 'water-leak', 'trash', 'other', or 'unrelated'."
            },
            reported_category: {
              type: Type.STRING,
              description: "The reported category from the user."
            },
            match: {
              type: Type.BOOLEAN,
              description: "Whether the actual category matches the reported category."
            },
            severity: {
              type: Type.INTEGER,
              description: "Severity score of the hazard from 1 to 10 (or 0 if invalid/unrelated)."
            },
            confidence: {
              type: Type.INTEGER,
              description: "Confidence score from 0 to 100."
            },
            decision: {
              type: Type.STRING,
              description: "The verification decision: 'VALID_REPORT', 'INVALID_REPORT', or 'NEEDS_MANUAL_REVIEW'."
            },
            reasoning: {
              type: Type.STRING,
              description: "The detailed reasoning behind the analysis, visible objects, and decision."
            },
            visible_objects: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of major objects detected in the image."
            }
          },
          required: ["actual_category", "reported_category", "match", "severity", "confidence", "decision", "reasoning", "visible_objects"]
        }
      }
    });

   const resultText = response.text;

console.log("========== GEMINI RESPONSE ==========");
console.log(resultText);
console.log("=====================================");
    console.log(`[Gemini client] Received response: ${resultText}`);
    
    if (!resultText) {
      throw new Error("Empty response from Gemini Content generation.");
    }
let geminiJson;

try {
  geminiJson = JSON.parse(resultText.trim());

  console.log("PARSED GEMINI JSON:");
  console.log(JSON.stringify(geminiJson, null, 2));
} catch (parseError) {
  console.error("JSON PARSE FAILED");
  console.error(resultText);
  throw parseError;
}

// --- AUTOMATIC BACKEND CONSISTENCY CHECK ---
let actualCategory = (geminiJson.actual_category || "other")
  .toLowerCase()
  .trim();

let reportedCategory = declaredCategory
  .toLowerCase()
  .trim();

let isMatch = geminiJson.match;
let confidenceScore = geminiJson.confidence || 100;
let decision = geminiJson.decision || "INVALID_REPORT";
let reasoning =
  geminiJson.reasoning ||
  geminiJson.reason ||
  "No reasoning provided.";

const normalizedActual = normalizeCategory(actualCategory);
const normalizedReported = normalizeCategory(reportedCategory);

// Reject immediately if image is unrelated
if (actualCategory === "unrelated") {
  decision = "INVALID_REPORT";
  isMatch = false;
}

// Category mismatch
else if (normalizedActual !== normalizedReported) {
  console.warn(
    `[Consistency Check] Category mismatch detected. Manual verification required. (Reported: ${declaredCategory}, Actual: ${geminiJson.actual_category})`
  );

  confidenceScore = Math.max(10, confidenceScore - 30);
  isMatch = false;

  reasoning =
    `Category mismatch detected. Manual verification required. ${reasoning}`;

  decision = "INVALID_REPORT";
}

const isValidReport = decision === "VALID_REPORT";

return {
  isValid: isValidReport,
  severityScore: geminiJson.severity || 0,
  verifiedCategory:
    (actualCategory === "unrelated"
      ? "other"
      : actualCategory) as any,
  rejectionReason: isValidReport ? undefined : reasoning,
  confidenceScore,
  autoDescription: reasoning.substring(0, 200)
};

} catch (error) {
  console.error("================================");
  console.error("GEMINI FAILED, FALLING BACK TO LOCAL TRIAGE");
  console.error(error);
  console.error("================================");

  return fallbackTriage(declaredCategory, userDescription);
}
}


/**
 * Normalizes categories to align user tags with AI detected category naming conventions
 */
export function normalizeCategory(cat: string): string {
  const c = (cat || "").toLowerCase().trim();
  if (c.includes("pothole")) return "pothole";
  if (c.includes("light") || c.includes("lamp") || c.includes("street-light") || c.includes("streetlight")) return "broken-streetlight";
  if (c.includes("water") || c.includes("leak") || c.includes("pipe") || c.includes("aqueduct")) return "water-leak";
  if (c.includes("trash") || c.includes("garbage") || c.includes("dump") || c.includes("litter") || c.includes("waste")) return "trash";
  return "other";
}

function fallbackTriage(category: string, description: string = ""): TriageResult {
  const lowerDesc = (description || "").toLowerCase();

  // 1. Define explicit infrastructure keywords
  const isTrash = lowerDesc.includes("trash") || lowerDesc.includes("garbage") || lowerDesc.includes("dumping") || lowerDesc.includes("litter") || lowerDesc.includes("waste");
  const isLight = lowerDesc.includes("light") || lowerDesc.includes("lamp") || lowerDesc.includes("dark") || lowerDesc.includes("beacon") || lowerDesc.includes("bulb");
  const isPothole = lowerDesc.includes("hole") || lowerDesc.includes("road") || lowerDesc.includes("pavement") || lowerDesc.includes("crack") || lowerDesc.includes("sidewalk") || lowerDesc.includes("crater");
  const isLeak = lowerDesc.includes("water") || lowerDesc.includes("leak") || lowerDesc.includes("pipe") || lowerDesc.includes("gushing") || lowerDesc.includes("burst");

  // Determine category based on keywords and/or user-declared category
  let computedCategory: 'pothole' | 'broken-streetlight' | 'water-leak' | 'trash' | 'other' = 'other';
  if (isPothole) computedCategory = 'pothole';
  else if (isLight) computedCategory = 'broken-streetlight';
  else if (isLeak) computedCategory = 'water-leak';
  else if (isTrash) computedCategory = 'trash';

  // Identify off-topic or screenshots/unrelated inputs
  const isUnrelated = lowerDesc.includes("chat") || 
                      lowerDesc.includes("screenshot") || 
                      lowerDesc.includes("message") || 
                      lowerDesc.includes("conversation") ||
                      lowerDesc.includes("selfie") || 
                      lowerDesc.includes("meme") ||
                      lowerDesc.includes("vacation") ||
                      lowerDesc.includes("food") ||
                      lowerDesc.includes("photo of a chat") ||
                      lowerDesc.includes("whatsapp") ||
                      lowerDesc.includes("discord") ||
                      lowerDesc.includes("telegram");

  const hasNoInfrastructureKeywords = !(isTrash || isLight || isPothole || isLeak || lowerDesc.includes("damage") || lowerDesc.includes("broken") || lowerDesc.includes("municipal") || lowerDesc.includes("hazard") || lowerDesc.includes("danger"));

  const wordCount = description.trim().split(/\s+/).length;

  if (isUnrelated || (wordCount < 4 && hasNoInfrastructureKeywords)) {
    return {
      isValid: false,
      severityScore: 0,
      verifiedCategory: 'other',
      rejectionReason: "No civic infrastructure issue visible",
      confidenceScore: 100,
      autoDescription: "No civic infrastructure issue visible"
    };
  }

  // Check mismatch
  const normCategory = normalizeCategory(category);
  const normComputed = normalizeCategory(computedCategory);

  let finalConfidence = 90;
  let isValid = true;
  let rejectionReason: string | undefined = undefined;

  if (normComputed !== normCategory && computedCategory !== 'other') {
    console.warn(`[Consistency Check] Category mismatch detected. Manual verification required. (Reported: ${category}, Actual: ${computedCategory})`);
    finalConfidence = Math.max(10, finalConfidence - 30);
    isValid = false;
    rejectionReason = `Category mismatch detected. Manual verification required. (Reported: ${category}, Actual: ${computedCategory})`;
  }

  // Calculate severity
  let severity = 5;
  if (computedCategory === 'water-leak') severity = 6;
  else if (computedCategory === 'broken-streetlight') severity = 4;
  else if (computedCategory === 'pothole') severity = 5;
  else if (computedCategory === 'trash') severity = 3;

  return {
    isValid: isValid,
    severityScore: severity,
    verifiedCategory: computedCategory === 'other' ? category as any : computedCategory,
    rejectionReason: rejectionReason,
    confidenceScore: finalConfidence,
    autoDescription: `Automated assessment of reported ${computedCategory} based on user input: '${description.substring(0, 45)}...'.`
  };
}

/**
 * Validates whether the uploaded image is public infrastructure damage of the requested category.
 * Used as part of the multer + cloudinary + mongodb pipeline.
 */
export async function validateInfrastructureImage(
  base64Data: string,
  mimeType: string,
  category: string
): Promise<TriageResult> {
  const base64Image = base64Data.startsWith('data:') 
    ? base64Data 
    : `data:${mimeType};base64,${base64Data}`;
    const userDescription = "";
    return triageIssueImage(base64Image, category, userDescription);
}


