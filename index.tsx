/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI} from '@google/genai';
import {initializeApp} from 'firebase/app';
// FIX: Use the standard 'firebase/auth' entry point which is correctly
// defined in the importmap in index.html.
// FIX: Switched to named imports for firebase/auth to align with Firebase v9+ modular SDK.
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  Firestore,
} from 'firebase/firestore';

// --- Firebase Configuration and Initialization ---
// FIX: Hardcode Firebase config as process.env is not available on GitHub Pages.
const firebaseConfig = {
  apiKey: "AIzaSyABU-AlOCIc_Xuz-wmnn-WnmQ8JvuNNLMA",
  authDomain: "product-scene-generator-79219.firebaseapp.com",
  projectId: "product-scene-generator-79219",
  storageBucket: "product-scene-generator-79219.firebasestorage.app",
  messagingSenderId: "827024070535",
  appId: "1:827024070535:web:cec35b042c945e4d9a2522",
};


let auth: Auth | null = null;
let db: Firestore | null = null;
let currentUser: User | null = null;

if (firebaseConfig.apiKey) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error('Firebase initialization failed:', e);
  }
}

// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
    hasSelectedApiKey: () => Promise<boolean>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    // This provides a fallback for environments where the dialog isn't available
    showStatusError(
      'API 密钥选择不可用。请配置 API_KEY 环境变量。',
    );
  }
}

// --- DOM Element Selection ---
const statusEl = document.querySelector('#status') as HTMLDivElement;
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const outputImage = document.querySelector('#output-image') as HTMLImageElement;
const outputVideo = document.querySelector('#output-video') as HTMLVideoElement;
const loadingIndicator = document.querySelector(
  '#loading-indicator',
) as HTMLDivElement;
const loadingQuoteEl = document.querySelector(
  '#loading-quote',
) as HTMLParagraphElement;
const uploadContainer = document.querySelector(
  '#upload-container',
) as HTMLDivElement;
const uploadPlaceholder = document.querySelector(
  '#upload-placeholder',
) as HTMLDivElement;
const fileInput = document.querySelector('#file-input') as HTMLInputElement;
const imagePreview = document.querySelector(
  '#image-preview',
) as HTMLImageElement;
const removeImageButton = document.querySelector(
  '#remove-image-button',
) as HTMLButtonElement;
const analyzeButton = document.querySelector(
  '#analyze-button',
) as HTMLButtonElement;
const scenariosContainer = document.querySelector(
  '#scenarios-container',
) as HTMLDivElement;
const scenariosList = document.querySelector(
  '#scenarios-list',
) as HTMLDivElement;
const regenerateButton = document.querySelector(
  '#regenerate-button',
) as HTMLButtonElement;
const mediaActions = document.querySelector('#media-actions') as HTMLDivElement;
const regenerateMediaButton = document.querySelector(
  '#regenerate-media-button',
) as HTMLButtonElement;
const downloadButton = document.querySelector(
  '#download-button',
) as HTMLButtonElement;
const productDescriptionInput = document.querySelector(
  '#product-description-input',
) as HTMLTextAreaElement;
const clearDescriptionButton = document.querySelector(
  '#clear-description-button',
) as HTMLButtonElement;
const clearPromptButton = document.querySelector(
  '#clear-prompt-button',
) as HTMLButtonElement;
const personaSelector = document.querySelector(
  '#persona-selector',
) as HTMLDivElement;
const personaCards = document.querySelectorAll(
  '.persona-card',
) as NodeListOf<HTMLButtonElement>;
const adjustmentToggle = document.querySelector(
  '#adjustment-toggle',
) as HTMLInputElement;
const feedbackContainer = document.querySelector(
  '#feedback-container',
) as HTMLDivElement;
const analysisTextEl = document.querySelector(
  '#analysis-text',
) as HTMLParagraphElement;
const feedbackYesButton = document.querySelector(
  '#feedback-yes',
) as HTMLButtonElement;
const feedbackNoButton = document.querySelector(
  '#feedback-no',
) as HTMLButtonElement;
const loginButton = document.querySelector('#login-button') as HTMLButtonElement;
const logoutButton = document.querySelector(
  '#logout-button',
) as HTMLButtonElement;
const userProfileEl = document.querySelector(
  '#user-profile',
) as HTMLDivElement;
const userAvatarEl = document.querySelector('#user-avatar') as HTMLImageElement;
const userNameEl = document.querySelector('#user-name') as HTMLSpanElement;

// --- State Variables ---
let uploadedImageBase64: string | null = null;
let uploadedImageHash: string | null = null;
let productDescription = '';
let quoteInterval: number | null = null;
let analyzedProductDescription: string | null = null;
let generatedScenarios: {english: string; chinese: string}[] = [];
let lastUsedPrompt: string | null = null;
let selectedPersona = 'analyst';
let recommendedCamera: string | null = null;
let allowCreativeAdjustments = false;
let isCorrectionMode = false;
let lastGeneratedUrl: string | null = null;
let lastGeneratedMediaType: 'image' | 'video' | null = null;
// This will be populated by the banner's React component for use in native functions
let apiKey: string | null = null;


// --- Constants ---
const LOADING_QUOTES_IMAGE = [
  '精心雕琢，铸就完美图像...',
  '提示词越详细，图像细节越丰富。',
  '将您的文字转化为视觉杰作。',
  '在提示词中尝试不同的艺术风格。',
  '耐心是伟大艺术的画布。',
  '想象力是唯一的极限。',
];

const LOADING_QUOTES_VIDEO = [
  '正在构思场景...',
  '摄像机准备就绪...',
  '正在渲染关键帧... (这可能需要一两分钟)',
  '应用色彩校正...',
  '合成最终视频...',
  '即将完成，请稍候...',
];

const PERSONA_PROMPTS: {[key: string]: string} = {
  analyst: `You are an omniscient, all-category Product Analyst. Your expertise is in rapid, precise, and factual identification of any product. Your goal is to produce a clinical, expert-level analysis and then devise three scenarios that serve as clear, unambiguous demonstrations of the product's key features and use cases, as if for a technical specification sheet or a product encyclopedia. The scenarios should be clean, well-lit, and focus purely on the product's function without extraneous lifestyle elements.`,
  ecommerce: `You are an expert E-commerce Merchandiser and Product Photographer. Your goal is to create clean, well-lit, commercially appealing scenarios perfect for online store listings, advertisements, and promotional materials. Focus on clarity, showcasing the product's features, and creating an aspirational but accessible look that drives sales.`,
  influencer: `You are a top-tier Social Media Influencer and Content Creator. Your goal is to create trendy, aspirational, and highly engaging lifestyle scenarios. The scenes should feel authentic, tell a story, and have a strong, aesthetic mood suitable for platforms like Instagram or Pinterest. Incorporate human elements and create a vibe that feels both personal and desirable.`,
  photographer: `You are a world-class Professional Commercial Photographer. Your goal is to create artistic, editorial-style scenarios with a mastery of light and composition. Focus on dramatic lighting, unique compositions, and high-end aesthetics suitable for magazine spreads, art prints, or a premium brand's lookbook. The mood should be sophisticated and visually striking.`,
  designer: `You are a renowned Interior Designer. Your goal is to create scenarios that showcase how the product seamlessly integrates into a specific, well-defined interior design style (e.g., Scandinavian, Mid-Century Modern, Industrial Loft). Focus on context, harmony, and the overall room ambiance. The product should be the hero, but the environment should tell a compelling story about taste and lifestyle.`,
  comprehensive: `You are a top-tier Chief Creative Officer, leading a multidisciplinary team of an E-commerce Merchandiser, a Social Media Influencer, a Professional Photographer, and an Interior Designer. Your mission is to synthesize the strengths of all these experts to create three exceptionally effective and multifaceted scenarios. Each scenario must be a perfect fusion: 1) commercially powerful for sales (E-commerce), 2) inherently shareable and trend-aware (Influencer), 3) artistically composed with masterful lighting (Photographer), and 4) beautifully integrated into a believable, high-end environment (Designer). The result should be a collection of ultimate, high-impact product visuals that excel across all platforms, from a product page to a magazine spread to a viral social media post.`,
  videographer: `You are an expert Commercial Director and Videographer. Your goal is to conceptualize three short, dynamic, and visually compelling video clips (5-7 seconds each) that showcase the product in action. The scenes should be perfect for high-energy social media ads (like TikTok or Instagram Reels) or as engaging B-roll for a product commercial. Focus on movement, storytelling, and demonstrating the product's primary value proposition in a cinematic way. Your prompts should describe camera movements (e.g., "slow push-in," "dynamic orbiting shot"), action, and the overall mood.`,
};

// --- Functions ---

/**
 * Generates a SHA-256 hash for a given base64 string.
 * @param base64String The base64 string to hash.
 * @returns A promise that resolves to the hex string of the hash.
 */
async function generateImageHash(base64String: string): Promise<string> {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const buffer = bytes.buffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getProductHistory(imageHash: string): Promise<string | null> {
  if (!db || !currentUser || !imageHash) return null;
  try {
    const docRef = doc(db, 'users', currentUser.uid, 'history', imageHash);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().description;
    }
    return null;
  } catch (e) {
    console.error('Error fetching product history from Firestore:', e);
    return null;
  }
}

async function saveProductCorrection(imageHash: string, description: string) {
  if (!db || !currentUser || !imageHash || !description) return;
  try {
    const docRef = doc(db, 'users', currentUser.uid, 'history', imageHash);
    await setDoc(docRef, {description}, {merge: true});
  } catch (e) {
    console.error('Error saving product correction to Firestore:', e);
    showStatusError('无法保存更正到云端。');
  }
}

async function checkProductHistory(imageHash: string) {
  const description = await getProductHistory(imageHash);
  if (description) {
    productDescriptionInput.value = description;
    productDescription = description;
    statusEl.innerText = '已从历史记录中加载产品描述。';
  }
}

function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  promptEl.disabled = disabled;
  analyzeButton.disabled = disabled;
  regenerateButton.disabled = disabled;
  fileInput.disabled = disabled;
  productDescriptionInput.disabled = disabled;
  clearDescriptionButton.disabled = disabled;
  clearPromptButton.disabled = disabled;
  personaCards.forEach(card => (card.disabled = disabled));
  adjustmentToggle.disabled = disabled;
  (uploadContainer as any).style.pointerEvents = disabled ? 'none' : 'auto';

  if (!disabled) {
    const hasImage = !!uploadedImageBase64;
    analyzeButton.disabled = !hasImage;
    productDescriptionInput.disabled = !hasImage;
    clearDescriptionButton.disabled = !hasImage;
    regenerateButton.disabled = !hasImage;
    generateButton.disabled = !promptEl.value.trim();
    clearPromptButton.disabled = false;
    personaCards.forEach(card => (card.disabled = !hasImage));
    adjustmentToggle.disabled = !hasImage;
  }
}

async function generateMedia(
  prompt: string,
  apiKey: string,
  persona: string,
) {
  const ai = new GoogleGenAI({apiKey});
  if (persona === 'videographer') {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9',
      },
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        operation = await ai.operations.getVideosOperation({operation});
      } catch (e) {
        console.error('Error fetching video operation status:', e);
        // Break the loop if status fetching fails continuously
        throw new Error('获取视频生成状态失败。');
      }
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error('视频生成完成，但未找到下载链接。');
    }

    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) {
      throw new Error(`无法下载生成的视频 (HTTP ${response.status})`);
    }
    const videoBlob = await response.blob();
    lastGeneratedUrl = URL.createObjectURL(videoBlob);
    outputVideo.src = lastGeneratedUrl;
    lastGeneratedMediaType = 'video';
  } else {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
    });
    const images = response.generatedImages;
    if (images === undefined || images.length === 0) {
      throw new Error('未生成任何图片。提示可能已被屏蔽。');
    }
    const base64ImageBytes = images[0].image.imageBytes;
    lastGeneratedUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
    outputImage.src = lastGeneratedUrl;
    lastGeneratedMediaType = 'image';
  }
}

async function generateScenarios(
  base64Image: string,
  apiKey: string,
  description: string,
  persona: string,
  allowAdjustments: boolean,
): Promise<{
  description: {english: string; chinese: string};
  scenarios: {english: string; chinese: string}[];
  recommended_camera: string;
}> {
  const ai = new GoogleGenAI({apiKey});
  const model = 'gemini-2.5-flash';
  const imagePart = {
    inlineData: {mimeType: 'image/jpeg', data: base64Image},
  };
  let userProvidedContext = description.trim()
    ? `The user has provided this crucial context about the product: "${description}". Use this information as the primary source of truth for the product's identity and function. The image serves as the visual reference.`
    : '';
  const personaInstruction =
    PERSONA_PROMPTS[persona] || PERSONA_PROMPTS['comprehensive'];
  const orientationInstruction = allowAdjustments
    ? `The product's core appearance, scale, and recognizability must be preserved. However, you have creative license to make slight, logical adjustments to the product's orientation and camera angle to best integrate it into the new scene. For example, you can slightly rotate it or show it from a slightly different but still recognizable angle if it makes the scene more natural. The product must remain the clear focal point.`
    : `The product's **position in the frame and its scale relative to the frame** must be described to **identically match** the source image. The **camera's viewing angle** relative to the product must also be preserved. This is a strict requirement to ensure visual consistency.`;

  const textPart = {
    text: `Your Identity: ${personaInstruction}

${userProvidedContext}

Your task is to act as a virtual product photography director. You will analyze the product in the image and generate three distinct, detailed, and hyper-realistic application scenarios for an advanced text-to-image generation model, all from the perspective of your assigned identity.

**Crucial Rule for Human Presence:** If the source image contains a person or parts of a person (e.g., hands, legs), you must **completely ignore them** in your analysis of the original image. Your generated scenarios should then feature a **new, different, and contextually appropriate** human presence interacting with the product. Do not attempt to replicate or describe the person from the source image.

Follow this process:
0.  **Product Identification via Web Search:** Before any other analysis, you **must** use your integrated search tool to analyze the product in the image. Search the web to identify its likely brand, official product name, and primary product category. This online research is your first and most crucial step to ensure you accurately understand the product's identity and function before proceeding.
1.  **Deconstruct and Analyze the Product Structure (Strict Fidelity Required):** Your first and most critical task is to meticulously deconstruct the product. **Combine the visual information from the image with the insights gained from your web search** to create your description. The image is the visual ground truth for appearance, but your search results provide the factual ground truth for identity. Your description must be a direct, factual report, with **no creative additions, assumptions, or embellishments beyond what is visually present and factually confirmed.** You must meticulously deconstruct the product into its primary structural components. For a complex item like a storage cart, this means identifying and listing each distinct part (e.g., 'the main white plastic frame', 'the four transparent plastic drawers', 'the gold-colored metal handles', 'the chrome support rods', 'the grey caster wheels'). For each identified component, you must provide a detailed analysis of its **specific material**, its **exact intrinsic color (describe the color as if under neutral white light, ignoring colored lighting or reflections from the environment; be extremely descriptive, e.g., "a warm, polished brass-gold with a slight satin finish" instead of just "gold")**, and its **surface texture**. Your final description must be decisive. Based on your web search and visual analysis, provide a single, confident product identification. **AVOID using ambiguous terms or alternative classifications like '... or ...'**. State what the product IS.
2.  **Analyze Composition and Framing:** Analyze the product's visual composition in the source image. Note its exact **position in the frame** (e.g., "centered horizontally, positioned in the bottom half of the image"), its **proportion/scale** (how much of the frame it occupies, e.g., "occupies approximately 60% of the lower half of the frame"), and the precise **camera angle** (e.g., eye-level, low-angle shot, 45-degree angle from the front-left). This analysis is mandatory and must be reflected in your output.
3.  **Analyze and Replicate the Original Camera Settings:** This is a mandatory and critical step. Instead of inventing new settings, you must meticulously analyze the source image to **deduce the camera properties used to capture it.** Your goal is to replicate the original photo's perspective and depth of field to ensure the product's appearance is perfectly preserved.
    *   **Deduce Lens Focal Length:** Analyze the perspective compression and field of view. A natural, un-distorted look suggests a standard lens (e.g., 50mm, 85mm). A slightly compressed background suggests a telephoto lens. A very up-close, detailed shot of a small object suggests a macro lens (e.g., 100mm macro). State your deduced lens.
    *   **Deduce Aperture:** Analyze the depth of field. If the entire scene is sharp, a smaller aperture was used (e.g., f/8, f/11). If there's slight background softness but the product is fully in focus, a mid-range aperture might have been used (e.g., f/4, f/5.6). Your primary goal is to ensure the entire product is in focus, so deduce an aperture that achieves this, mirroring the source image.
    *   **This single, deduced camera setup will be the foundation for all generated scenarios.**
4.  **Synthesize the Master Product Description:** Based on your analysis in steps 0 and 1, synthesize the complete, multi-sentence paragraph that will become the value for the "product_description" key in the final JSON. This is your master description and the single source of truth for the product's appearance.
5.  **Generate Realistic Usage Scenarios (Persona-driven):** Based on your assigned identity and the detailed product analysis, create three **completely distinct and realistic** scenarios. Each scenario must place the product in a **brand-new, plausible usage environment** that is different from the one in the source image and aligns with your identity's goals. **All scenarios must strictly adhere to real-world logic. AVOID creating fantastical or surreal scenes.** The goal is to showcase the product in various authentic contexts. It is **critical to AVOID recreating the background or context from the original photo.**

For each scenario, you must craft a rich prompt that adheres to these strict guidelines:
1.  **Replicated Virtual Camera Setup:** Every prompt must begin with the single, deduced 'Virtual Camera' specification you determined in the analysis phase.
2.  **Absolute Product Fidelity - THE HIGHEST PRIORITY:** This is the most important rule. You **must** take the **entire master product description** you synthesized in Step 4 and use it directly as the core description of the product within your new scene. **Do not summarize, alter, or omit any details from this master description when describing the product.** You will build the new scene's description (the environment, lighting, contextual items, human interaction) *around* this verbatim product description. The product's entire design, structure, materials, colors, and textures are immutable and must not be altered.
3.  **Maintain Visual Framing and Orientation:** ${orientationInstruction}
4.  **Grounded & Hyper-realistic Scene with Contextual Items:** Describe a highly realistic and detailed application environment. The product must be the focal point but seamlessly integrated into a believable, "lived-in" space. It is **mandatory** to include several relevant, non-obstructing contextual items that one would naturally find in that setting. These items are crucial for creating a sense of realism. For example:
    *   For a kitchen storage unit: include a half-peeled lemon on a cutting board, a crumpled dish towel, and a ceramic bowl with fresh herbs.
    *   For an office chair: include a laptop on the desk with code on the screen, a half-empty coffee mug, and a stack of design books.
    Crucially, avoid overly clean, sterile, or perfectly staged environments. The scene must feel authentic and used.
5.  **CRITICAL - Showcase Product Functionality:** The scene MUST clearly and logically demonstrate the product's primary function. For example, if the product is a projector, it must be shown powered on and projecting a crisp, vibrant, and contextually appropriate image (like a movie scene or a presentation slide) onto a screen or wall. If it's a speaker, perhaps show subtle visual cues of sound or people enjoying music. The product must be depicted in an active state of use to clearly communicate its purpose and value.
6.  **Unobstructed Product View:** Any added items or people must not block or obscure any part of the product. The product must remain fully and clearly visible.
7.  **Elite Photographic Quality:** The final image must be **ultra-photorealistic, 4K UHD resolution, and hyper-detailed.** It should have the quality of a high-end commercial photograph for a premium brand, characterized by **vibrant colors, high dynamic range, and exceptional clarity.**
    *   **Lighting:** Describe lighting that is both natural and enhances the product, ensuring the scene is **bright, clear, and avoids any flat, grayish, or washed-out look.** Emphasize high contrast and clarity.
    *   **Focus & Sharpness:** The entire scene must be **tack sharp**, with every detail clearly visible. The product and its immediate surroundings should be perfectly in focus. **Strictly avoid any depth-of-field blur or bokeh effects.**
    *   **Aesthetic & Mood:** The goal is pure realism. The image must have professional-grade color grading for a clean, vibrant aesthetic. **Strictly avoid:** artificial digital filters, vignettes, lens flares, or unnatural color casts.
8.  **Realistic Human Presence (If Applicable):** Based on the product's function, it is **highly encouraged** to include a person interacting with the product naturally and logically. The depiction must be realistic and anatomically plausible. When describing actions, use clear, grammatically correct sentences. For example, instead of an awkward phrase like "a lady's manicured hand reaches...", prefer clearer constructions such as "a woman with manicured hands reaches..." or simply "a manicured hand reaches...". Avoid strange crops or incomplete body parts that look unnatural. If only a part of a person is shown (e.g., a hand), it must be framed naturally, such as 'a hand reaching for a book'. Any human presence must be unposed and contextually appropriate.
9.  **No Text or Logos - CRITICAL:** The resulting image must be completely free of any text, letters, numbers, labels, brands, or logos on any object or surface. This is a non-negotiable final instruction.
10. **Reference Instruction:** Each scenario prompt (both English and Chinese) must end with the literal phrase 'Generate based on the reference product image.'. This is a mandatory final instruction.

Finally, provide the output in a single JSON object. The object must have three keys: "product_description", "recommended_camera", and "scenarios".
- "product_description": An object with two keys: "english" and "chinese". The value for each key should be a string containing a comprehensive, multi-sentence paragraph that **must be in absolute, strict alignment with the product shown in the reference image.** This paragraph must begin with the product's function, then provide a detailed breakdown of its structure, describing each component's specific color, material, and texture **exactly as seen.** It must conclude by specifying the product's overall screen percentage and position in the original image. This description must be rich enough to allow a 3D artist to model the product accurately from text alone, **serving as a perfect textual mirror of the visual reference.**
- "recommended_camera": A string containing the full, deduced Virtual Camera setup (e.g., "(Virtual Camera: 85mm lens, f/8, 1/125s, ISO 100)").
- "scenarios": An array of three objects. Each object in the array must have two keys: "english" (the scenario prompt in English) and "chinese" (the same scenario prompt translated into Simplified Chinese).

Do not use any markdown formatting or any other text outside of the JSON object. Your entire response must be only the JSON.

Example JSON structure:
{
  "product_description": {
    "english": "This is a mobile four-tiered storage cart for home organization. The main frame is made of a durable, semi-gloss off-white plastic. It houses four fully transparent, hard plastic drawers. Each drawer features a rectangular handle made of warm, polished brass-gold metal. The entire structure is supported by four vertical rods of cool-toned, polished chrome metal. The cart is fitted with four small, neutral grey plastic caster wheels. In the source image, the cart occupies roughly 70% of the frame's vertical height and is positioned slightly to the right of the center.",
    "chinese": "这是一个移动式四层储物车，用于家庭收纳。主框架由耐用的半光泽灰白色塑料制成。它包含四个完全透明的硬塑料抽屉。每个抽屉都有一个由温暖的抛光黄铜金色金属制成的矩形把手。整个结构由四根冷色调的抛光铬金属垂直杆支撑。储物车配有四个小巧的中性灰色塑料脚轮。在源图像中，该储物车约占画面垂直高度的70%，位置略微偏向中心右侧。"
  },
  "recommended_camera": "(Virtual Camera: 50mm lens, f/8, 1/125s, ISO 100)",
  "scenarios": [
    {
      "english": "(Virtual Camera: 50mm lens, f/8, 1/125s, ISO 100) A photorealistic image of... Generate based on the reference product image.",
      "chinese": "(虚拟相机: 50mm 镜头, f/8, 1/125s, ISO 100) 一张...的写实照片 Generate based on the reference product image."
    }
  ]
}
`,
  };

  const response = await ai.models.generateContent({
    model: model,
    contents: {parts: [imagePart, textPart]},
    config: {
      tools: [{googleSearch: {}}],
    },
  });

  let jsonString = response.text.trim();
  const jsonMatch = jsonString.match(/```(json)?([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[2]) {
    jsonString = jsonMatch[2].trim();
  } else {
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    const jsonResponse = JSON.parse(jsonString);
    if (
      !jsonResponse.scenarios ||
      !Array.isArray(jsonResponse.scenarios) ||
      !jsonResponse.product_description ||
      typeof jsonResponse.product_description !== 'object' ||
      typeof jsonResponse.product_description.english !== 'string' ||
      typeof jsonResponse.product_description.chinese !== 'string' ||
      !jsonResponse.recommended_camera ||
      typeof jsonResponse.recommended_camera !== 'string'
    ) {
      throw new Error(
        'AI 返回格式无效。应为包含 "scenarios" 数组、"product_description" 和 "recommended_camera" 字符串的对象。',
      );
    }
    return {
      description: jsonResponse.product_description,
      scenarios: jsonResponse.scenarios.slice(0, 3),
      recommended_camera: jsonResponse.recommended_camera,
    };
  } catch (e) {
    console.error('Failed to parse JSON response from AI:', jsonString);
    throw new Error('解析 AI 返回内容失败。请重试。');
  }
}

function renderScenarios(scenarios: {english: string; chinese: string}[]) {
  scenariosList.innerHTML = '';
  if (scenarios.length === 0) {
    scenariosContainer.style.display = 'none';
    return;
  }

  const createCopyButton = (textToCopy: string, title: string) => {
    const button = document.createElement('button');
    const iconSVG = `<svg class="w-5 h-5 text-gray-400 hover:text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
    const successIconSVG = `<svg class="w-5 h-5 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    button.innerHTML = iconSVG;
    button.className =
      'flex-shrink-0 p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
    button.title = title;
    button.setAttribute('aria-label', title);
    let copyTimeout: number;
    button.onclick = e => {
      e.stopPropagation();
      navigator.clipboard.writeText(textToCopy).then(() => {
        button.innerHTML = successIconSVG;
        clearTimeout(copyTimeout);
        copyTimeout = window.setTimeout(() => {
          button.innerHTML = iconSVG;
        }, 2000);
      });
    };
    return button;
  };

  scenarios.forEach(scenario => {
    const card = document.createElement('div');
    card.className =
      'bg-[#353739] p-3 rounded-lg border border-gray-600 hover:border-blue-500 cursor-pointer transition-all duration-200 flex items-start space-x-3';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const englishCol = document.createElement('div');
    englishCol.className = 'flex-1 flex flex-col space-y-2';
    const englishHeader = document.createElement('div');
    englishHeader.className = 'flex justify-between items-center';
    englishHeader.innerHTML =
      '<strong class="text-white text-sm">英文</strong>';
    englishHeader.appendChild(
      createCopyButton(scenario.english, '复制英文提示词'),
    );
    const englishText = document.createElement('textarea');
    englishText.className = 'scenario-textarea';
    englishText.value = scenario.english;
    englishText.readOnly = true;
    englishText.rows = 5;
    englishCol.appendChild(englishHeader);
    englishCol.appendChild(englishText);
    const chineseCol = document.createElement('div');
    chineseCol.className = 'flex-1 flex flex-col space-y-2';
    const chineseHeader = document.createElement('div');
    chineseHeader.className = 'flex justify-between items-center';
    chineseHeader.innerHTML =
      '<strong class="text-gray-400 text-sm">中文</strong>';
    chineseHeader.appendChild(
      createCopyButton(scenario.chinese, '复制中文提示词'),
    );
    const chineseText = document.createElement('textarea');
    chineseText.className = 'scenario-textarea';
    chineseText.value = scenario.chinese;
    chineseText.readOnly = true;
    chineseText.rows = 5;
    chineseCol.appendChild(chineseHeader);
    chineseCol.appendChild(chineseText);
    card.appendChild(englishCol);
    card.appendChild(chineseCol);
    const selectScenario = () => {
      promptEl.value = scenario.english;
      generateButton.disabled = false;
      if (selectedPersona === 'videographer') {
        generateButton.innerText = '生成视频';
      } else {
        generateButton.innerText = '生成图片';
      }
      promptEl.focus();
      document
        .querySelectorAll('#scenarios-list > div')
        .forEach(el =>
          el.classList.remove('border-blue-500', 'ring-2', 'ring-blue-500'),
        );
      card.classList.add('border-blue-500', 'ring-2', 'ring-blue-500');
    };
    card.onclick = selectScenario;
    card.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectScenario();
      }
    };
    scenariosList.appendChild(card);
  });
  scenariosContainer.style.display = 'block';
}

function handleFile(file: File) {
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = async e => {
      const result = e.target?.result as string;
      imagePreview.src = result;
      uploadedImageBase64 = result.split(',')[1];
      uploadedImageHash = await generateImageHash(uploadedImageBase64);
      if (currentUser && uploadedImageHash) {
        await checkProductHistory(uploadedImageHash);
      }
      promptEl.value = '';
      promptEl.placeholder = '请先分析图片或选择下方场景';
      generateButton.disabled = true;
      analyzedProductDescription = null;
      generatedScenarios = [];
      recommendedCamera = null;
      isCorrectionMode = false;
      analyzeButton.innerText = '分析产品并生成场景';
      imagePreview.classList.remove('hidden');
      uploadPlaceholder.classList.add('hidden');
      removeImageButton.classList.remove('hidden');
      analyzeButton.disabled = false;
      productDescriptionInput.disabled = false;
      clearDescriptionButton.disabled = false;
      regenerateButton.disabled = false;
      personaCards.forEach(card => (card.disabled = false));
      adjustmentToggle.disabled = false;
      scenariosContainer.style.display = 'none';
      scenariosList.innerHTML = '';
      feedbackContainer.classList.add('hidden');
      mediaActions.classList.add('hidden');
      outputImage.classList.add('hidden');
      outputVideo.classList.add('hidden');
    };
    reader.readAsDataURL(file);
  } else {
    showStatusError('请上传有效的图片文件。');
  }
}

async function handleAnalyzeClick() {
  const currentApiKey = (window as any).API_KEY;
  if (!currentApiKey) {
    showStatusError('API 密钥未配置。请通过下方横幅选择您的 API 密钥。');
    await openApiKeyDialog();
    return;
  }
  if (!uploadedImageBase64) {
    showStatusError('请先上传图片。');
    return;
  }
  if (isCorrectionMode) {
    if (uploadedImageHash) {
      await saveProductCorrection(
        uploadedImageHash,
        productDescriptionInput.value,
      );
    }
    isCorrectionMode = false;
    analyzeButton.innerText = '分析产品并生成场景';
    productDescriptionInput.classList.remove('ring-2', 'ring-yellow-400');
  }
  setControlsDisabled(true);
  statusEl.innerText = '正在分析产品并生成场景...';
  scenariosContainer.style.display = 'none';
  feedbackContainer.classList.add('hidden');
  try {
    const {description, scenarios, recommended_camera} =
      await generateScenarios(
        uploadedImageBase64,
        currentApiKey,
        productDescription,
        selectedPersona,
        allowCreativeAdjustments,
      );
    analyzedProductDescription = description.english;
    generatedScenarios = scenarios;
    recommendedCamera = recommended_camera;
    renderScenarios(scenarios);
    analysisTextEl.textContent = description.chinese;
    if (currentUser) {
      feedbackContainer.classList.remove('hidden');
      statusEl.innerText = '分析完成。请确认 AI 分析结果是否准确。';
    } else {
      statusEl.innerText = '分析完成。';
    }
    promptEl.placeholder = '选择以上场景或输入您自己的提示词...';
  } catch (e) {
    console.error('Scenario generation failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : '发生未知错误。';
    let userFriendlyMessage = `生成场景时出错： ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
        if (errorMessage.includes('Rpc failed due to xhr error')) {
            userFriendlyMessage = 'API 请求失败。这通常是由于 API 密钥无效或网络问题。请检查您的 API 密钥并重试。';
            shouldOpenDialog = true;
        }
    }
    showStatusError(userFriendlyMessage);
    if (shouldOpenDialog) {
        await openApiKeyDialog();
    }
  } finally {
    setControlsDisabled(false);
  }
}

async function generate(promptOverride?: string) {
  // For Veo, we must use the official key selection dialog.
  if (selectedPersona === 'videographer') {
    if (!window.aistudio?.hasSelectedApiKey) {
      showStatusError('此环境不支持视频生成所需的 API 密钥选择器。');
      return;
    }
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await openApiKeyDialog();
      // Assume the user selected a key, and try to proceed.
    }
  }

  const currentApiKey = (window as any).API_KEY;
  if (!currentApiKey) {
    showStatusError('API 密钥未配置。请通过下方横幅选择您的 API 密钥。');
    await openApiKeyDialog();
    return;
  }
  const prompt = promptOverride ?? promptEl.value;
  if (!prompt.trim()) {
    showStatusError('请输入提示词以生成。');
    return;
  }
  lastUsedPrompt = prompt;
  let finalPrompt = prompt;
  const isScenarioPrompt = generatedScenarios.some(s => s.english === prompt);
  if (recommendedCamera && !isScenarioPrompt && selectedPersona !== 'videographer') {
    finalPrompt = `${recommendedCamera} ${prompt}`;
  }
  if (!isScenarioPrompt) {
    finalPrompt = `${finalPrompt}. CRITICAL RULE: The final image must be completely free of any text, letters, numbers, labels, brands, or logos.`;
  }
  const isVideo = selectedPersona === 'videographer';
  statusEl.innerText = isVideo ? '正在生成视频...' : '正在生成图片...';
  outputImage.style.display = 'none';
  outputVideo.style.display = 'none';
  mediaActions.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');
  setControlsDisabled(true);
  const quotes = isVideo ? LOADING_QUOTES_VIDEO : LOADING_QUOTES_IMAGE;
  let quoteIndex = 0;
  loadingQuoteEl.textContent = quotes[quoteIndex];
  if (quoteInterval) clearInterval(quoteInterval);
  quoteInterval = window.setInterval(() => {
    quoteIndex = (quoteIndex + 1) % quotes.length;
    loadingQuoteEl.style.opacity = '0';
    setTimeout(() => {
      loadingQuoteEl.textContent = quotes[quoteIndex];
      loadingQuoteEl.style.opacity = '1';
    }, 500);
  }, isVideo ? 5000 : 3000);
  try {
    await generateMedia(finalPrompt, currentApiKey, selectedPersona);
    if (lastGeneratedMediaType === 'video') {
      outputVideo.style.display = 'block';
    } else {
      outputImage.style.display = 'block';
    }
    mediaActions.classList.remove('hidden');
    statusEl.innerText = '生成成功。';
  } catch (e) {
    console.error('Generation failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : '发生未知错误。';
    let userFriendlyMessage = `错误： ${errorMessage}`;
    let shouldOpenDialog = false;
    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Rpc failed due to xhr error')) {
        userFriendlyMessage = 'API 请求失败。这通常是由于 API 密钥无效或网络问题。请检查您的 API 密钥并重试。';
        shouldOpenDialog = true;
      } else if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          '找不到模型或资源。这可能是由于无效的 API 密钥或权限问题。请重试或选择新密钥。';
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage =
          '您的 API 密钥无效或权限不足。请输入有效的 API 密钥。';
        shouldOpenDialog = true;
      }
    }
    showStatusError(userFriendlyMessage);
    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    loadingIndicator.classList.add('hidden');
    setControlsDisabled(false);
    if (quoteInterval) {
      clearInterval(quoteInterval);
      quoteInterval = null;
    }
  }
}

// --- Firebase Auth Functions ---
async function handleLogin() {
  if (!auth) {
    showStatusError('Firebase Auth 未初始化。');
    return;
  }
  const provider = new GoogleAuthProvider();
  try {
    // FIX: Revert to signInWithPopup as it's more reliable in cross-origin
    // contexts like GitHub Pages, avoiding complex redirect issues.
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    showStatusError(`登录失败：${(error as Error).message}`);
  }
}

async function handleLogout() {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout Error:', error);
    showStatusError('登出失败。');
  }
}

function updateUserUI(user: User | null) {
  currentUser = user;
  if (user) {
    loginButton.classList.add('hidden');
    userProfileEl.classList.remove('hidden');
    userProfileEl.classList.add('flex');
    userAvatarEl.src = user.photoURL || '';
    userNameEl.textContent = user.displayName || '用户';
    statusEl.innerText = '已登录，历史记录将同步到云端。';
  } else {
    loginButton.classList.remove('hidden');
    userProfileEl.classList.add('hidden');
    userProfileEl.classList.remove('flex');
    statusEl.innerText = '请上传图片以开始。';
  }
}

// --- Event Listeners ---
promptEl.addEventListener('input', () => {
  generateButton.disabled = !promptEl.value.trim();
});

generateButton.addEventListener('click', () => generate());

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  uploadContainer.addEventListener(eventName, e => {
    e.preventDefault();
    e.stopPropagation();
  });
});

['dragenter', 'dragover'].forEach(eventName => {
  uploadContainer.addEventListener(eventName, () => {
    uploadContainer.classList.add('border-blue-500');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  uploadContainer.addEventListener(eventName, () => {
    uploadContainer.classList.remove('border-blue-500');
  });
});

uploadContainer.addEventListener('drop', e => {
  const dt = e.dataTransfer;
  if (dt?.files?.length) {
    handleFile(dt.files[0]);
  }
});

removeImageButton.addEventListener('click', () => {
  uploadedImageBase64 = null;
  uploadedImageHash = null;
  productDescription = '';
  productDescriptionInput.value = '';
  analyzedProductDescription = null;
  generatedScenarios = [];
  recommendedCamera = null;
  fileInput.value = '';
  imagePreview.src = '';
  imagePreview.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
  removeImageButton.classList.add('hidden');
  analyzeButton.disabled = true;
  analyzeButton.innerText = '分析产品并生成场景';
  isCorrectionMode = false;
  productDescriptionInput.disabled = true;
  clearDescriptionButton.disabled = true;
  regenerateButton.disabled = true;
  personaCards.forEach(card => (card.disabled = true));
  adjustmentToggle.disabled = true;
  adjustmentToggle.checked = false;
  allowCreativeAdjustments = false;
  scenariosContainer.style.display = 'none';
  scenariosList.innerHTML = '';
  mediaActions.classList.add('hidden');
  outputImage.style.display = 'none';
  outputImage.src = '';
  outputVideo.style.display = 'none';
  outputVideo.src = '';
  promptEl.placeholder = '请先上传并分析图片...';
  feedbackContainer.classList.add('hidden');
  productDescriptionInput.classList.remove('ring-2', 'ring-yellow-400');
});

analyzeButton.addEventListener('click', handleAnalyzeClick);
regenerateButton.addEventListener('click', handleAnalyzeClick);

downloadButton.addEventListener('click', () => {
  if (!lastGeneratedUrl) return;
  const link = document.createElement('a');
  link.href = lastGeneratedUrl;
  const extension = lastGeneratedMediaType === 'video' ? 'mp4' : 'jpg';
  link.download = `generated-${lastGeneratedMediaType}-${Date.now()}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

regenerateMediaButton.addEventListener('click', () => {
  if (lastUsedPrompt !== null) {
    generate(lastUsedPrompt);
  }
});

productDescriptionInput.addEventListener('input', () => {
  productDescription = productDescriptionInput.value;
});

clearDescriptionButton.addEventListener('click', () => {
  productDescription = '';
  productDescriptionInput.value = '';
});

clearPromptButton.addEventListener('click', () => {
  promptEl.value = '';
  generateButton.disabled = true;
});

personaCards.forEach(card => {
  card.addEventListener('click', () => {
    if (card.disabled) return;
    selectedPersona = card.dataset.persona || 'ecommerce';
    personaCards.forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-pressed', 'false');
    });
    card.classList.add('selected');
    card.setAttribute('aria-pressed', 'true');

    if (promptEl.value) {
       if (selectedPersona === 'videographer') {
        generateButton.innerText = '生成视频';
      } else {
        generateButton.innerText = '生成图片';
      }
    }
  });
});

adjustmentToggle.addEventListener('change', () => {
  allowCreativeAdjustments = adjustmentToggle.checked;
});

feedbackYesButton.addEventListener('click', async () => {
  if (analyzedProductDescription && uploadedImageHash) {
    await saveProductCorrection(uploadedImageHash, analyzedProductDescription);
    statusEl.innerText = '分析已确认并保存到历史记录。';
  }
  feedbackContainer.classList.add('hidden');
});

feedbackNoButton.addEventListener('click', () => {
  if (analyzedProductDescription) {
    isCorrectionMode = true;
    productDescriptionInput.value = analyzedProductDescription;
    productDescription = analyzedProductDescription;
    analyzeButton.innerText = '使用更正重新生成';
    statusEl.innerText = '请在上方第二步中更正产品描述，然后重新生成。';
    productDescriptionInput.classList.add('ring-2', 'ring-yellow-400');
    productDescriptionInput.focus();
  }
  feedbackContainer.classList.add('hidden');
});

// --- Auth Event Listeners ---
if (auth) {
  // FIX: Remove getRedirectResult as we are now using signInWithPopup.
  // The onAuthStateChanged listener is sufficient for handling login state.
  loginButton.addEventListener('click', handleLogin);
  logoutButton.addEventListener('click', handleLogout);
  onAuthStateChanged(auth, user => {
    updateUserUI(user);
    // If the user logs in and has an image uploaded, check history
    if (user && uploadedImageHash) {
      checkProductHistory(uploadedImageHash);
    }
  });
}
