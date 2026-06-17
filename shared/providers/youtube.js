// YouTube provider implementation
// Handles YouTube-specific cookie management and request preparation

import { Persona } from '../personas/Persona.js';
import { PersonaManager } from '../personas/PersonaManager.js';

/**
 * YouTube-specific Persona with YouTube cookie handling
 */
export class YouTubePersona extends Persona {
	constructor(options = {}) {
		super({
			provider: 'youtube',
			...options
		});

		// YouTube-specific state
		this.state = {
			consentGiven: false,
			visitorId: null,
			sessionId: null,
			...options.state
		};
	}

	/**
	 * Get headers specifically for YouTube requests
	 * @returns {object} Headers object
	 */
	getRequestHeaders() {
		const domain = 'www.youtube.com';
		const cookieHeader = this.getCookieHeader(domain);

		return {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.5',
			'Accept-Encoding': 'gzip, deflate, br',
			'DNT': '1',
			'Connection': 'keep-alive',
			'Upgrade-Insecure-Requests': '1',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'none',
			'Sec-Fetch-User': '?1',
			...(cookieHeader && { 'Cookie': cookieHeader })
		};
	}

	/**
	 * Update YouTube-specific state from cookies
	 */
	updateYouTubeState() {
		// Extract CONSENT
		const consentCookie = this.cookies.get('CONSENT');
		this.state.consentGiven = !!consentCookie;

		// Extract VISITOR_INFO1_LIVE
		const visitorCookie = this.cookies.get('VISITOR_INFO1_LIVE');
		this.state.visitorId = visitorCookie?.value || null;

		// Extract __Secure-YENID (session identifier)
		const yenidCookie = this.cookies.get('__Secure-YENID');
		this.state.sessionId = yenidCookie?.value || null;
	}

	/**
	 * Get YouTube-specific cookie info
	 * @returns {object} YouTube cookie status
	 */
	getYouTubeCookieStatus() {
		return {
			CONSENT: this.cookies.get('CONSENT')?.value || null,
			VISITOR_INFO1_LIVE: this.cookies.get('VISITOR_INFO1_LIVE')?.value || null,
			YSC: this.cookies.get('YSC')?.value || null,
			__Secure_YEC: this.cookies.get('__Secure-YEC')?.value?.substring(0, 50) || null,
			__Secure_YENID: this.cookies.get('__Secure-YENID')?.value?.substring(0, 50) || null,
			VISITOR_PRIVACY_METADATA: this.cookies.get('VISITOR_PRIVACY_METADATA')?.value?.substring(0, 50) || null
		};
	}
}

/**
 * YouTube-specific PersonaManager
 */
export class YouTubePersonaManager extends PersonaManager {
	constructor(options = {}) {
		super({
			providerId: 'youtube',
			maxPersonas: options.maxPersonas || 10,
			rotationStrategy: options.rotationStrategy || 'round-robin',
			...options
		});

		// YouTube-specific settings
		this.cookieNames = [
			'CONSENT',
			'VISITOR_INFO1_LIVE',
			'YSC',
			'__Secure-YEC',
			'__Secure-YENID',
			'VISITOR_PRIVACY_METADATA',
			'PREF',
			'SID',
			'HSID',
			'SSID',
			'APISID',
			'SAPISID'
		];
	}

	/**
	 * Create a new YouTube persona with initial setup
	 * @param {object} options - Persona options
	 * @returns {YouTubePersona}
	 */
	createPersona(options = {}) {
		const persona = new YouTubePersona(options);

		// Set initial consent cookie if not provided
		if (!persona.cookies.has('CONSENT')) {
			persona.cookies.set('CONSENT', {
				name: 'CONSENT',
				value: 'YES+cb.20240101-17-p0.en+FX+114',
				attributes: [],
				domain: '.youtube.com'
			});
		}

		this.personas.set(persona.id, persona);
		this.stats.totalPersonasCreated++;

		return persona;
	}

	/**
	 * Update a YouTube persona after a request
	 * @param {string} personaId - ID of persona to update
	 * @param {object} response - Response object
	 * @param {string} domain - Domain (default: www.youtube.com)
	 */
	updatePersona(personaId, response, domain = 'www.youtube.com') {
		const persona = this.personas.get(personaId);
		if (!persona) return;

		// Update cookies from response
		const setCookieHeaders = response.headers?.getSetCookie();
		if (setCookieHeaders) {
			persona.updateCookies(setCookieHeaders, domain);
		}

		// Update YouTube-specific state
		persona.updateYouTubeState();

		// Mark as used
		persona.markUsed();

		this.stats.totalRequests++;
	}

	/**
	 * Get YouTube-specific statistics
	 * @returns {object}
	 */
	getYouTubeStats() {
		const personas = this.getActivePersonas();
		const cookieStats = {};

		for (const name of this.cookieNames) {
			const count = personas.filter(p => p.cookies.has(name)).length;
			cookieStats[name] = count;
		}

		return {
			...this.getStats(),
			cookieCoverage: cookieStats,
			averageCookiesPerPersona: personas.length > 0
				? personas.reduce((sum, p) => sum + p.cookies.size, 0) / personas.length
				: 0
		};
	}

	/**
	 * Get detailed info about all personas for debugging
	 * @returns {Array}
	 */
	getDetailedPersonaInfo() {
		return this.getActivePersonas().map(persona => ({
			id: persona.id,
			createdAt: new Date(persona.createdAt).toISOString(),
			lastUsed: new Date(persona.lastUsed).toISOString(),
			requestCount: persona.requestCount,
			cookies: persona.getYouTubeCookieStatus()
		}));
	}
}
