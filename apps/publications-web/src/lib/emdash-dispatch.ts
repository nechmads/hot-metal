import type { Publication } from '@hotmetal/data-layer'

/**
 * Workers-for-Platforms dispatch namespace binding — `get(scriptName)` returns a
 * Fetcher for the named tenant EmDash script.
 */
export interface DispatchNamespace {
	get(scriptName: string): Fetcher
}

/** True when a publication is served by a (provisioned) EmDash tenant. */
export function isEmdashReady(pub: Publication): boolean {
	return pub.cmsProvider === 'emdash' && pub.cmsProvisioningStatus === 'ready'
}

/**
 * The tenant script name to dispatch to, parsed from `cms_instance_meta`. Returns
 * null if the meta is missing/unparseable/has no scriptName — which, for a `ready`
 * EmDash publication, is a data-integrity error the caller should surface (502),
 * NOT silently render as legacy SonicJS.
 */
export function emdashScriptName(pub: Publication): string | null {
	if (!pub.cmsInstanceMeta) return null
	try {
		const meta = JSON.parse(pub.cmsInstanceMeta) as { scriptName?: unknown }
		return typeof meta.scriptName === 'string' && meta.scriptName ? meta.scriptName : null
	} catch {
		return null
	}
}
