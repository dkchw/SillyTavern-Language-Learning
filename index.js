const MODULE_NAME = 'language_learning_tutor';
const EXTENSION_DIR = 'third-party/SillyTavern-Language-Learning';

const defaultFormulatePrompt = `You are a conversational language tutor helping a learner speak {{targetLanguage}}.
The user is having a conversation with "{{char}}".
User's native language: {{nativeLanguage}}.
Target language: {{targetLanguage}}.
Proficiency level: {{level}}.
Formality / Tone: {{formality}}.
{{guidance}}

The user will describe what they want to say. Formulate authentic, natural spoken dialogue in {{targetLanguage}} suitable for this context.

Return ONLY a JSON object with this exact structure:
{
  "expression": "Natural spoken expression in {{targetLanguage}}",
  "reading": "Phonetic romanization or pronunciation reading (e.g. Romaji/Pinyin/IPA)",
  "translation": "Literal or direct meaning in {{nativeLanguage}}",
  "grammarNote": "Brief 1-sentence tip on key vocabulary, particles, or nuance"
}`;

const defaultMcqPrompt = `[Language Learning Task]
Analyze the ongoing conversation above between {{char}} and {{user}}.
Create 3 or 4 distinct, engaging response options that {{user}} could say next to {{char}} in {{targetLanguage}}.
Each choice must represent a different tone or reaction (e.g. Polite Agreement, Playful Teasing, Inquisitive Question, Empathetic Reaction).
Learner level: {{level}}.
Learner native language: {{nativeLanguage}}.
Target language: {{targetLanguage}}.
{{guidance}}

Output ONLY a JSON array of objects with this schema:
[
  {
    "tone": "Brief tone tag (e.g. Polite, Playful, Curious, Concerned)",
    "expression": "Spoken sentence in {{targetLanguage}}",
    "reading": "Pronunciation / Romanization (Romaji, Pinyin, etc.)",
    "translation": "Meaning in {{nativeLanguage}}"
  }
]`;

const defaultImpersonatePrompt = `[Language Learning Task]
Write the next in-character response for {{user}} replying to {{char}} in {{targetLanguage}}.
Target Language: {{targetLanguage}}.
Learner Level: {{level}}.
Formality: {{formality}}.
Native Language for explanation: {{nativeLanguage}}.
{{guidance}}

Return ONLY a JSON object:
{
  "expression": "In-character reply for {{user}} in {{targetLanguage}}",
  "reading": "Phonetic reading / romanization",
  "translation": "Translation in {{nativeLanguage}}",
  "grammarNote": "Brief nuance explanation"
}`;

const defaultSettings = Object.freeze({
    targetLanguage: 'Japanese',
    targetLanguageCustom: '',
    nativeLanguage: 'English',
    nativeLanguageCustom: '',
    formality: 'Natural / Contextual',
    level: 'Intermediate',
    customGuidance: '',
    formulatePromptTemplate: defaultFormulatePrompt,
    mcqPromptTemplate: defaultMcqPrompt,
    impersonatePromptTemplate: defaultImpersonatePrompt,
    showReading: true,
    showGrammar: true,
    showAudio: true,
    isMinimized: false,
});

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

function getEffectiveTargetLanguage() {
    const s = getSettings();
    if (s.targetLanguage === 'custom') {
        return s.targetLanguageCustom?.trim() || 'Japanese';
    }
    return s.targetLanguage || 'Japanese';
}

function getEffectiveNativeLanguage() {
    const s = getSettings();
    if (s.nativeLanguage === 'custom') {
        return s.nativeLanguageCustom?.trim() || 'English';
    }
    return s.nativeLanguage || 'English';
}

function resolvePromptTemplate(template, vars) {
    let result = template || '';
    for (const [k, v] of Object.entries(vars)) {
        const regex = new RegExp(`{{${k}}}`, 'g');
        result = result.replace(regex, v || '');
    }
    return result;
}

const langVoiceCodes = {
    'Japanese': 'ja-JP',
    'Spanish': 'es-ES',
    'French': 'fr-FR',
    'German': 'de-DE',
    'Chinese (Mandarin)': 'zh-CN',
    'Chinese': 'zh-CN',
    'Korean': 'ko-KR',
    'Russian': 'ru-RU',
    'Italian': 'it-IT',
    'Portuguese': 'pt-PT',
    'Vietnamese': 'vi-VN',
    'Arabic': 'ar-SA',
    'English': 'en-US',
};

function playSpeech(text, lang) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langVoiceCodes[lang] || 'ja-JP';
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('[Language Learning] Speech playback error:', e);
    }
}

// 1. Formulate user's intended thought into target language
async function formulateExpression(userIntent) {
    if (!userIntent || !userIntent.trim()) return null;

    const { generateRaw, characters, characterId, name1, name2 } = SillyTavern.getContext();
    const settings = getSettings();
    const charName = characters[characterId]?.data?.name || name2 || 'Partner';
    const userName = name1 || 'User';
    const targetLang = getEffectiveTargetLanguage();
    const nativeLang = getEffectiveNativeLanguage();

    const guidanceText = settings.customGuidance?.trim()
        ? `Special Language Guidance & Instructions for ${targetLang}:\n${settings.customGuidance.trim()}`
        : '';

    const systemPrompt = resolvePromptTemplate(settings.formulatePromptTemplate || defaultFormulatePrompt, {
        targetLanguage: targetLang,
        nativeLanguage: nativeLang,
        char: charName,
        user: userName,
        level: settings.level,
        formality: settings.formality,
        guidance: guidanceText,
    });

    const prompt = `What I want to say to ${charName}: "${userIntent.trim()}"`;

    try {
        const rawJson = await generateRaw({
            prompt,
            systemPrompt,
            trimNames: false,
        });

        const match = rawJson.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return {
            expression: rawJson.trim(),
            reading: '',
            translation: userIntent,
            grammarNote: '',
        };
    } catch (error) {
        console.error('[Language Learning] Formulation error:', error);
        toastr.error('Failed to formulate expression. Check LLM connection.');
        return null;
    }
}

// 2. Generate Multiple Choice (MCQ) reply options based on active chat
async function generateMCQChoices() {
    const { generateQuietPrompt, characters, characterId, name1, name2 } = SillyTavern.getContext();
    const settings = getSettings();
    const charName = characters[characterId]?.data?.name || name2 || 'Partner';
    const userName = name1 || 'User';
    const targetLang = getEffectiveTargetLanguage();
    const nativeLang = getEffectiveNativeLanguage();

    const guidanceText = settings.customGuidance?.trim()
        ? `Special Language Guidance & Instructions for ${targetLang}:\n${settings.customGuidance.trim()}`
        : '';

    const quietInstruction = resolvePromptTemplate(settings.mcqPromptTemplate || defaultMcqPrompt, {
        targetLanguage: targetLang,
        nativeLanguage: nativeLang,
        char: charName,
        user: userName,
        level: settings.level,
        formality: settings.formality,
        guidance: guidanceText,
    });

    try {
        const rawResponse = await generateQuietPrompt({
            quietPrompt: quietInstruction,
            skipWIAN: true,
            responseLength: 500,
        });

        const match = rawResponse.match(/\[[\s\S]*\]/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return [];
    } catch (e) {
        console.error('[Language Learning] MCQ generation error:', e);
        toastr.error('Failed to generate MCQ suggestions.');
        return [];
    }
}

// 3. Impersonate: write in-character response in target language
async function generateImpersonatedReply() {
    const { generateQuietPrompt, characters, characterId, name1, name2 } = SillyTavern.getContext();
    const settings = getSettings();
    const charName = characters[characterId]?.data?.name || name2 || 'Partner';
    const userName = name1 || 'User';
    const targetLang = getEffectiveTargetLanguage();
    const nativeLang = getEffectiveNativeLanguage();

    const guidanceText = settings.customGuidance?.trim()
        ? `Special Language Guidance & Instructions for ${targetLang}:\n${settings.customGuidance.trim()}`
        : '';

    const quietInstruction = resolvePromptTemplate(settings.impersonatePromptTemplate || defaultImpersonatePrompt, {
        targetLanguage: targetLang,
        nativeLanguage: nativeLang,
        char: charName,
        user: userName,
        level: settings.level,
        formality: settings.formality,
        guidance: guidanceText,
    });

    try {
        const rawResponse = await generateQuietPrompt({
            quietPrompt: quietInstruction,
            skipWIAN: true,
            responseLength: 400,
        });

        const match = rawResponse.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return {
            expression: rawResponse.trim(),
            reading: '',
            translation: '',
            grammarNote: '',
        };
    } catch (e) {
        console.error('[Language Learning] Impersonate error:', e);
        toastr.error('Failed to generate impersonated reply.');
        return null;
    }
}

// Display expression in study box
function displayStudyResult(data) {
    if (!data) return;
    const settings = getSettings();
    const resultBox = $('#st_lang_study_box');

    $('#st_lang_target_expr').text(data.expression || '');

    if (settings.showReading && data.reading) {
        $('#st_lang_reading_expr').text(data.reading).show();
    } else {
        $('#st_lang_reading_expr').hide();
    }

    if (data.translation) {
        $('#st_lang_trans_expr').text(`Meaning: ${data.translation}`).show();
    } else {
        $('#st_lang_trans_expr').hide();
    }

    if (settings.showGrammar && data.grammarNote) {
        $('#st_lang_grammar_expr').text(`Tip: ${data.grammarNote}`).show();
    } else {
        $('#st_lang_grammar_expr').hide();
    }

    if (settings.showAudio && data.expression) {
        $('#st_lang_play_audio').show();
    } else {
        $('#st_lang_play_audio').hide();
    }

    resultBox.slideDown(200);
}

// Render MCQ cards
function renderMCQCards(choices) {
    const container = $('#st_lang_mcq_list');
    container.empty();

    if (!Array.isArray(choices) || choices.length === 0) {
        container.hide();
        return;
    }

    choices.forEach((choice, index) => {
        const card = $(`
            <div class="st-lang-mcq-card" data-idx="${index}">
                <div class="st-lang-mcq-header">
                    <span class="st-lang-mcq-tone">${choice.tone || 'Option'}</span>
                    <button class="st-lang-action-btn st-lang-mcq-send-btn" title="Send now" style="padding: 1px 6px;">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
                <div class="st-lang-mcq-text">${choice.expression}</div>
                ${choice.reading ? `<div class="st-lang-mcq-sub" style="color: #ffb86c;">${choice.reading}</div>` : ''}
                ${choice.translation ? `<div class="st-lang-mcq-sub">${choice.translation}</div>` : ''}
            </div>
        `);

        card.on('click', function (e) {
            if ($(e.target).closest('.st-lang-mcq-send-btn').length) {
                $('#send_textarea').val(choice.expression).trigger('input');
                $('#send_but').trigger('click');
                container.slideUp(150);
                return;
            }

            displayStudyResult({
                expression: choice.expression,
                reading: choice.reading,
                translation: choice.translation,
                grammarNote: `Tone: ${choice.tone}`,
            });
        });

        container.append(card);
    });

    container.slideDown(200);
}

// Quick Language & Prompt Configuration Modal
async function openQuickConfigModal() {
    const { Popup, POPUP_TYPE, POPUP_RESULT, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = getSettings();

    const modalHtml = `
    <div style="display: flex; flex-direction: column; gap: 10px; max-height: 80vh; overflow-y: auto; padding: 4px;">
        <h3 style="margin: 0 0 6px 0; color: var(--SmartThemeQuoteColor, #79b8ff);">
            <i class="fa-solid fa-language"></i> Configure Target Language & Prompts
        </h3>

        <div>
            <label for="modal_lang_target"><b>Target Language:</b></label>
            <div style="display: flex; gap: 6px; margin-top: 4px;">
                <select id="modal_lang_target" class="text_pole" style="flex: 1;">
                    <option value="Japanese" ${settings.targetLanguage === 'Japanese' ? 'selected' : ''}>Japanese (日本語)</option>
                    <option value="Spanish" ${settings.targetLanguage === 'Spanish' ? 'selected' : ''}>Spanish (Español)</option>
                    <option value="French" ${settings.targetLanguage === 'French' ? 'selected' : ''}>French (Français)</option>
                    <option value="German" ${settings.targetLanguage === 'German' ? 'selected' : ''}>German (Deutsch)</option>
                    <option value="Chinese (Mandarin)" ${settings.targetLanguage === 'Chinese (Mandarin)' ? 'selected' : ''}>Chinese Mandarin (中文)</option>
                    <option value="Korean" ${settings.targetLanguage === 'Korean' ? 'selected' : ''}>Korean (한국어)</option>
                    <option value="Russian" ${settings.targetLanguage === 'Russian' ? 'selected' : ''}>Russian (Русский)</option>
                    <option value="Italian" ${settings.targetLanguage === 'Italian' ? 'selected' : ''}>Italian (Italiano)</option>
                    <option value="Portuguese" ${settings.targetLanguage === 'Portuguese' ? 'selected' : ''}>Portuguese (Português)</option>
                    <option value="Vietnamese" ${settings.targetLanguage === 'Vietnamese' ? 'selected' : ''}>Vietnamese (Tiếng Việt)</option>
                    <option value="Arabic" ${settings.targetLanguage === 'Arabic' ? 'selected' : ''}>Arabic (العربية)</option>
                    <option value="English" ${settings.targetLanguage === 'English' ? 'selected' : ''}>English</option>
                    <option value="custom" ${settings.targetLanguage === 'custom' ? 'selected' : ''}>-- Custom Language / Dialect --</option>
                </select>
                <input id="modal_lang_target_custom" type="text" class="text_pole" value="${settings.targetLanguageCustom || ''}" placeholder="Type custom language..." style="flex: 1; display: ${settings.targetLanguage === 'custom' ? 'block' : 'none'};" />
            </div>
        </div>

        <div>
            <label for="modal_lang_native"><b>Native / Explanation Language:</b></label>
            <div style="display: flex; gap: 6px; margin-top: 4px;">
                <select id="modal_lang_native" class="text_pole" style="flex: 1;">
                    <option value="English" ${settings.nativeLanguage === 'English' ? 'selected' : ''}>English</option>
                    <option value="Vietnamese" ${settings.nativeLanguage === 'Vietnamese' ? 'selected' : ''}>Vietnamese (Tiếng Việt)</option>
                    <option value="Chinese" ${settings.nativeLanguage === 'Chinese' ? 'selected' : ''}>Chinese (中文)</option>
                    <option value="Spanish" ${settings.nativeLanguage === 'Spanish' ? 'selected' : ''}>Spanish (Español)</option>
                    <option value="Russian" ${settings.nativeLanguage === 'Russian' ? 'selected' : ''}>Russian (Русский)</option>
                    <option value="French" ${settings.nativeLanguage === 'French' ? 'selected' : ''}>French (Français)</option>
                    <option value="German" ${settings.nativeLanguage === 'German' ? 'selected' : ''}>German (Deutsch)</option>
                    <option value="Japanese" ${settings.nativeLanguage === 'Japanese' ? 'selected' : ''}>Japanese (日本語)</option>
                    <option value="custom" ${settings.nativeLanguage === 'custom' ? 'selected' : ''}>-- Custom Language --</option>
                </select>
                <input id="modal_lang_native_custom" type="text" class="text_pole" value="${settings.nativeLanguageCustom || ''}" placeholder="Type custom language..." style="flex: 1; display: ${settings.nativeLanguage === 'custom' ? 'block' : 'none'};" />
            </div>
        </div>

        <div>
            <label for="modal_lang_guidance"><b>Target Language Specific Prompt & Nuance Instructions:</b></label>
            <textarea id="modal_lang_guidance" class="text_pole" rows="3" placeholder="e.g. Focus on Kansai dialect; use polite keigo; explain kanji readings; use casual teen slang...">${settings.customGuidance || ''}</textarea>
        </div>

        <div>
            <label for="modal_lang_formulate_prompt"><b>Expression Formulation Prompt Template:</b></label>
            <textarea id="modal_lang_formulate_prompt" class="text_pole" rows="4">${settings.formulatePromptTemplate || defaultFormulatePrompt}</textarea>
        </div>

        <div>
            <label for="modal_lang_mcq_prompt"><b>Multiple Choice (MCQ) Prompt Template:</b></label>
            <textarea id="modal_lang_mcq_prompt" class="text_pole" rows="4">${settings.mcqPromptTemplate || defaultMcqPrompt}</textarea>
        </div>

        <div>
            <label for="modal_lang_impersonate_prompt"><b>Impersonate Prompt Template:</b></label>
            <textarea id="modal_lang_impersonate_prompt" class="text_pole" rows="4">${settings.impersonatePromptTemplate || defaultImpersonatePrompt}</textarea>
        </div>

        <div>
            <button id="modal_reset_prompts" class="menu_button" style="width: auto;">
                <i class="fa-solid fa-rotate-left"></i> Reset Prompts to Default
            </button>
        </div>
    </div>
    `;

    const popup = new Popup(modalHtml, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Save Changes',
        cancelButton: 'Cancel',
        wide: true,
        allowVerticalScrolling: true,
    });

    setTimeout(() => {
        const targetSel = $('#modal_lang_target');
        const targetCustom = $('#modal_lang_target_custom');
        const nativeSel = $('#modal_lang_native');
        const nativeCustom = $('#modal_lang_native_custom');

        targetSel.on('change', () => {
            targetCustom.toggle(targetSel.val() === 'custom');
        });
        nativeSel.on('change', () => {
            nativeCustom.toggle(nativeSel.val() === 'custom');
        });

        $('#modal_reset_prompts').on('click', () => {
            $('#modal_lang_formulate_prompt').val(defaultFormulatePrompt);
            $('#modal_lang_mcq_prompt').val(defaultMcqPrompt);
            $('#modal_lang_impersonate_prompt').val(defaultImpersonatePrompt);
            toastr.info('Prompts reset to default template.');
        });
    }, 100);

    const res = await popup.show();
    if (res === POPUP_RESULT.AFFIRMATIVE) {
        settings.targetLanguage = popup.dlg.querySelector('#modal_lang_target')?.value || 'Japanese';
        settings.targetLanguageCustom = popup.dlg.querySelector('#modal_lang_target_custom')?.value || '';
        settings.nativeLanguage = popup.dlg.querySelector('#modal_lang_native')?.value || 'English';
        settings.nativeLanguageCustom = popup.dlg.querySelector('#modal_lang_native_custom')?.value || '';
        settings.customGuidance = popup.dlg.querySelector('#modal_lang_guidance')?.value || '';
        settings.formulatePromptTemplate = popup.dlg.querySelector('#modal_lang_formulate_prompt')?.value || defaultFormulatePrompt;
        settings.mcqPromptTemplate = popup.dlg.querySelector('#modal_lang_mcq_prompt')?.value || defaultMcqPrompt;
        settings.impersonatePromptTemplate = popup.dlg.querySelector('#modal_lang_impersonate_prompt')?.value || defaultImpersonatePrompt;

        saveSettingsDebounced();
        updateLanguageBarLabel();
        toastr.success('Language & Prompt configurations saved!');
    }
}

function updateLanguageBarLabel() {
    const target = getEffectiveTargetLanguage();
    const native = getEffectiveNativeLanguage();
    $('#st_lang_active_label').html(`${native} &rarr; ${target}`);
}

// Injects the Language Learning Bar directly above the SillyTavern chat send form
function injectLanguageBar() {
    if ($('#st_lang_learning_container').length) return;

    const sendForm = document.querySelector('#send_form');
    if (!sendForm || !sendForm.parentElement) return;

    const { saveSettingsDebounced } = SillyTavern.getContext();
    const settings = getSettings();
    const targetLang = getEffectiveTargetLanguage();
    const nativeLang = getEffectiveNativeLanguage();

    const barHtml = `
    <div id="st_lang_learning_container" class="${settings.isMinimized ? 'minimized' : ''}">
        <div class="st-lang-top-bar">
            <div class="st-lang-badge" id="st_lang_toggle_bar" title="Click to minimize/expand">
                <i class="fa-solid fa-graduation-cap"></i>
                <span>Tutor</span>
                <span class="lang-tag" id="st_lang_active_label" title="Click to change language & prompt settings">${nativeLang} &rarr; ${targetLang}</span>
            </div>
            <div class="st-lang-top-actions">
                <button id="st_lang_quick_config_btn" class="st-lang-action-btn" title="Configure Language & Custom Prompts">
                    <i class="fa-solid fa-sliders"></i> <span>Config</span>
                </button>
                <button id="st_lang_mcq_btn" class="st-lang-action-btn" title="Suggest multiple-choice reply options">
                    <i class="fa-solid fa-list-check"></i> <span>MCQ Choices</span>
                </button>
                <button id="st_lang_impersonate_btn" class="st-lang-action-btn" title="Write a reply for me in target language">
                    <i class="fa-solid fa-user-pen"></i> <span>Write for Me</span>
                </button>
                <button id="st_lang_min_btn" class="st-lang-action-btn" style="padding: 4px 6px;" title="Minimize / Expand">
                    <i class="fa-solid ${settings.isMinimized ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                </button>
            </div>
        </div>

        <div class="st-lang-body">
            <div class="st-lang-input-row">
                <input id="st_lang_intent_input" type="text" class="st-lang-intent-input" placeholder="Type what you want to say in your native language..." />
                <button id="st_lang_translate_btn" class="st-lang-action-btn" title="Formulate expression">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Translate</span>
                </button>
            </div>

            <div id="st_lang_study_box" class="st-lang-result-box" style="display: none;">
                <div id="st_lang_target_expr" class="st-lang-target-expression"></div>
                <div id="st_lang_reading_expr" class="st-lang-reading"></div>
                <div id="st_lang_trans_expr" class="st-lang-translation"></div>
                <div id="st_lang_grammar_expr" class="st-lang-grammar-note"></div>
                
                <div class="st-lang-result-actions">
                    <button id="st_lang_play_audio" class="st-lang-action-btn" title="Listen to pronunciation">
                        <i class="fa-solid fa-volume-high"></i> Listen
                    </button>
                    <button id="st_lang_copy_btn" class="st-lang-action-btn" title="Copy to clipboard">
                        <i class="fa-solid fa-copy"></i> Copy
                    </button>
                    <button id="st_lang_fill_chat_btn" class="st-lang-action-btn" title="Paste into chatbox to practice typing">
                        <i class="fa-solid fa-arrow-down"></i> Fill Chatbox
                    </button>
                    <button id="st_lang_send_now_btn" class="st-lang-action-btn" style="background: rgba(80, 250, 123, 0.2); color: #50fa7b; border-color: rgba(80, 250, 123, 0.4);" title="Paste and send immediately">
                        <i class="fa-solid fa-paper-plane"></i> Send
                    </button>
                </div>
            </div>

            <div id="st_lang_mcq_list" class="st-lang-mcq-container" style="display: none;"></div>
        </div>
    </div>
    `;

    $(barHtml).insertBefore(sendForm);

    const container = $('#st_lang_learning_container');
    const intentInput = $('#st_lang_intent_input');
    const minBtn = $('#st_lang_min_btn');

    const toggleMinimize = (e) => {
        if ($(e.target).closest('#st_lang_active_label').length) return;
        const isMin = container.toggleClass('minimized').hasClass('minimized');
        settings.isMinimized = isMin;
        minBtn.find('i').attr('class', `fa-solid ${isMin ? 'fa-chevron-down' : 'fa-chevron-up'}`);
        saveSettingsDebounced();
    };

    minBtn.on('click', toggleMinimize);
    $('#st_lang_toggle_bar').on('click', toggleMinimize);

    $('#st_lang_active_label, #st_lang_quick_config_btn').on('click', (e) => {
        e.stopPropagation();
        openQuickConfigModal();
    });

    const handleFormulate = async () => {
        const text = intentInput.val();
        if (!text || !text.trim()) return;

        const btn = $('#st_lang_translate_btn');
        btn.prop('disabled', true).find('i').attr('class', 'fa-solid fa-spinner fa-spin');

        try {
            const result = await formulateExpression(text);
            if (result) {
                displayStudyResult(result);
                $('#st_lang_mcq_list').slideUp(100);
            }
        } finally {
            btn.prop('disabled', false).find('i').attr('class', 'fa-solid fa-wand-magic-sparkles');
        }
    };

    $('#st_lang_translate_btn').on('click', handleFormulate);
    intentInput.on('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleFormulate();
        }
    });

    $('#st_lang_mcq_btn').on('click', async () => {
        const btn = $('#st_lang_mcq_btn');
        btn.prop('disabled', true).find('i').attr('class', 'fa-solid fa-spinner fa-spin');
        try {
            const choices = await generateMCQChoices();
            renderMCQCards(choices);
        } finally {
            btn.prop('disabled', false).find('i').attr('class', 'fa-solid fa-list-check');
        }
    });

    $('#st_lang_impersonate_btn').on('click', async () => {
        const btn = $('#st_lang_impersonate_btn');
        btn.prop('disabled', true).find('i').attr('class', 'fa-solid fa-spinner fa-spin');
        try {
            const result = await generateImpersonatedReply();
            if (result) {
                displayStudyResult(result);
                $('#st_lang_mcq_list').slideUp(100);
            }
        } finally {
            btn.prop('disabled', false).find('i').attr('class', 'fa-solid fa-user-pen');
        }
    });

    $('#st_lang_copy_btn').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            navigator.clipboard.writeText(text);
            toastr.info('Expression copied to clipboard.');
        }
    });

    $('#st_lang_fill_chat_btn').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            $('#send_textarea').val(text).trigger('input').focus();
        }
    });

    $('#st_lang_send_now_btn').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            $('#send_textarea').val(text).trigger('input');
            $('#send_but').trigger('click');
        }
    });

    $('#st_lang_play_audio').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            playSpeech(text, getEffectiveTargetLanguage());
        }
    });
}

(async function init() {
    const { renderExtensionTemplateAsync, saveSettingsDebounced, eventSource, eventTypes, SlashCommandParser, SlashCommand } = SillyTavern.getContext();

    // 1. Render Extension Settings Drawer
    try {
        const settings = getSettings();
        const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_DIR, 'settings', settings);
        $('#extensions_settings').append(settingsHtml);

        const targetSel = $('#st_lang_target');
        const targetCustom = $('#st_lang_target_custom');
        const nativeSel = $('#st_lang_native');
        const nativeCustom = $('#st_lang_native_custom');

        targetSel.val(settings.targetLanguage).on('change', function () {
            settings.targetLanguage = $(this).val();
            targetCustom.toggle(settings.targetLanguage === 'custom');
            updateLanguageBarLabel();
            saveSettingsDebounced();
        });
        targetCustom.val(settings.targetLanguageCustom || '').on('input', function () {
            settings.targetLanguageCustom = $(this).val();
            updateLanguageBarLabel();
            saveSettingsDebounced();
        });
        targetCustom.toggle(settings.targetLanguage === 'custom');

        nativeSel.val(settings.nativeLanguage).on('change', function () {
            settings.nativeLanguage = $(this).val();
            nativeCustom.toggle(settings.nativeLanguage === 'custom');
            updateLanguageBarLabel();
            saveSettingsDebounced();
        });
        nativeCustom.val(settings.nativeLanguageCustom || '').on('input', function () {
            settings.nativeLanguageCustom = $(this).val();
            updateLanguageBarLabel();
            saveSettingsDebounced();
        });
        nativeCustom.toggle(settings.nativeLanguage === 'custom');

        $('#st_lang_formality').val(settings.formality).on('change', function () {
            settings.formality = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_level').val(settings.level).on('change', function () {
            settings.level = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_custom_guidance').val(settings.customGuidance || '').on('input', function () {
            settings.customGuidance = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_formulate_prompt').val(settings.formulatePromptTemplate || defaultFormulatePrompt).on('input', function () {
            settings.formulatePromptTemplate = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_mcq_prompt').val(settings.mcqPromptTemplate || defaultMcqPrompt).on('input', function () {
            settings.mcqPromptTemplate = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_impersonate_prompt').val(settings.impersonatePromptTemplate || defaultImpersonatePrompt).on('input', function () {
            settings.impersonatePromptTemplate = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_reset_prompts_btn').on('click', function () {
            settings.formulatePromptTemplate = defaultFormulatePrompt;
            settings.mcqPromptTemplate = defaultMcqPrompt;
            settings.impersonatePromptTemplate = defaultImpersonatePrompt;
            $('#st_lang_formulate_prompt').val(defaultFormulatePrompt);
            $('#st_lang_mcq_prompt').val(defaultMcqPrompt);
            $('#st_lang_impersonate_prompt').val(defaultImpersonatePrompt);
            saveSettingsDebounced();
            toastr.info('Prompts reset to default template.');
        });

        $('#st_lang_show_reading').prop('checked', settings.showReading).on('change', function () {
            settings.showReading = $(this).is(':checked');
            saveSettingsDebounced();
        });

        $('#st_lang_show_grammar').prop('checked', settings.showGrammar).on('change', function () {
            settings.showGrammar = $(this).is(':checked');
            saveSettingsDebounced();
        });

        $('#st_lang_show_audio').prop('checked', settings.showAudio).on('change', function () {
            settings.showAudio = $(this).is(':checked');
            saveSettingsDebounced();
        });
    } catch (e) {
        console.error('[Language Learning] Failed to render settings template:', e);
    }

    // 2. Inject Language Bar when app is ready or immediately if DOM is ready
    if (eventSource && eventTypes) {
        eventSource.on(eventTypes.APP_READY, injectLanguageBar);
    }
    injectLanguageBar();

    // 3. Register Slash Commands
    try {
        if (SlashCommandParser && SlashCommand) {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'language-mcq',
                aliases: ['langmcq'],
                helpString: 'Generates multiple choice reply options in target language.',
                callback: async () => {
                    const choices = await generateMCQChoices();
                    renderMCQCards(choices);
                    return 'MCQ options generated.';
                },
            }));

            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'language-impersonate',
                aliases: ['langwrite'],
                helpString: 'Writes an in-character reply in target language.',
                callback: async () => {
                    const res = await generateImpersonatedReply();
                    if (res) displayStudyResult(res);
                    return 'Expression generated.';
                },
            }));

            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'language-config',
                aliases: ['langconfig'],
                helpString: 'Opens the Language Learning configuration dialog.',
                callback: async () => {
                    openQuickConfigModal();
                    return 'Language config opened.';
                },
            }));
        }
    } catch (e) {
        console.debug('[Language Learning] Slash command registration error:', e);
    }
})();
