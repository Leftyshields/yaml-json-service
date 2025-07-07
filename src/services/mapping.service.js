// This service will contain the logic to map parsed .mobileconfig or .xml data
// to your desired YAML schema.

// Placeholder for EAP type mappings (you'll need to define this based on your schema)
// This was an example from your original client-side code.
const eapTypes = {
  13: 'TLS',
  17: 'LEAP',
  18: 'PEAP', // Typically EAP-MSCHAPv2 (inner for PEAP)
  21: 'TTLS',
  23: 'EAP-MD5',
  25: 'MSCHAPV2', // Often used as inner for PEAP/TTLS
  26: 'MSCHAPV2', // Sometimes duplicated or specific vendor use
  43: 'EAP-AKA',
  50: 'EAP-AKA_PRIME',
  // Add other EAP types as needed by your schema and input files
};

// Helper to safely get a value from a nested object path
const get = (obj, path, defaultValue = undefined) => {
  const keys = Array.isArray(path) ? path : path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return defaultValue;
    }
  }
  return current;
};


/**
 * Maps parsed data (from .mobileconfig or .xml) to the target YAML schema.
 * This function needs to be adapted based on the actual structure of your
 * input files and the desired output YAML structure.
 *
 * @param {object} parsedData - The JavaScript object resulting from parsing the input file.
 * @param {string} fileType - Either 'mobileconfig' or 'xml'.
 * @returns {object} An object structured according to your target YAML schema.
 */
function mapToYamlSchema(parsedData, fileType) {
  console.log('[MappingService] Starting mapping for fileType:', fileType);
  console.log('[MappingService] Parsed Data for fileType ' + fileType + ':', JSON.stringify(parsedData, null, 2));

  const yamlSchema = {
    version: '1.0', // Or a version relevant to your schema
    passpoint_profile: {
      home_friendly_name: '',
      home_ois: [], // Array of { name, value, length, organization_id }
      roaming_consortiums: [], // Array of { name, value, length, organization_id }
      nai_realm: {
        name: '', // e.g., "example.com"
        eap_methods: [], // Array of { eap_type, inner_auth, vendor_id, vendor_type, other_eap_params... }
        // You might add other NAI realm specific fields here if needed
      },
      credential: {
        type: '', // e.g., 'UsernamePassword', 'TLSClientCertificate', 'SIM'
        username: '',
        password: '', // Be cautious with passwords
        realm: '', // Often same as NAI realm name, but can be distinct
        certificate_payload_uuid: '', // For TLSClientCertificate type
        machine_provisioning_profile_url: '', // For EAP-TLS machine provisioning
        imsi: '', // For SIM credentials
        mnc_mcc: '', // For SIM credentials
        // other credential fields
      },
      anqp_domain_id: '0', // Default to 0 if not specified
      ip_address_type_availability: { // Example structure
        ipv4: 'Unknown', // e.g., 'Available', 'NotAvailable', 'PortRestricted', 'Unknown'
        ipv6: 'Unknown', // e.g., 'Available', 'NotAvailable', 'PortRestricted', 'Unknown'
      },
      network_authentication_type: [], // Array of { type, url } e.g., { type: "acceptanceOfTermsAndConditions", url: "..." }
      venue_info: {
        group: '', // e.g., "Business", "Residential", "Educational"
        type: '',  // e.g., "Office", "Library", "Cafe"
        name: '',  // Specific venue name if available
        language: 'eng', // Default language
      },
      plmn_list: [], // Array of { mcc, mnc }
      terms_and_conditions: {
        url: '',
        language: 'eng', // Default language
      },
      policy: { // For network policy information
        url: '',
        title: '', // Optional title for the policy
        language: 'eng',
      },
      wan_metrics: { // Example structure
        link_status: 'Up', // 'Up', 'Down', 'Test'
        symmetric_link: 'Unknown', // 'Symmetric', 'Asymmetric', 'Unknown'
        at_capacity: false,
        downlink_speed: 0, // in kbps
        uplink_speed: 0,   // in kbps
        downlink_load: 0,  // percentage
        uplink_load: 0,    // percentage
        lmd: 0,            // Load Measurement Duration in ms
      },
      connection_capability: [], // Array of { protocol, port_number, status: 'Open'/'Closed'/'Filtered' }
      operating_class: '', // e.g., "81" (US/Canada 2.4GHz channels 1-11)
      icons: [], // Array of { width, height, language, type, filename, url, data (base64) }
      osu_providers: [], // Array of { server_uri, method_list: [], friendly_name, icon_url, nai, description }
      // Add other top-level Passpoint fields as needed by your schema
      // For example:
      // operator_icon_metadata: [],
      // anqp_elements: [], // For raw ANQP elements if you need to store them
      // supported_eap_methods_outside_osu: [],
      // required_dhcp_options: [],
    },
  };

  if (fileType === 'mobileconfig' || fileType === 'xml') {
    let wifiPayload = null;
    if (parsedData.PayloadContent && Array.isArray(parsedData.PayloadContent)) {
      wifiPayload = parsedData.PayloadContent.find(
        p => p.PayloadType === 'com.apple.wifi.managed' &&
             p.EncryptionType !== 'None' &&
             (p.IsHotspot === true || p.NAIRealmNames || p.RoamingConsortiumOIs)
      );
      if (!wifiPayload) {
        wifiPayload = parsedData.PayloadContent.find(
          p => p.PayloadType === 'com.apple.wifi.managed' && p.EncryptionType !== 'None'
        );
      }
    } else if (fileType === 'xml') {
      console.warn('[MappingService] XML mapping needs specific path adjustments for wifiPayload detection.');
      wifiPayload = parsedData;
    }

    if (wifiPayload) {
      console.log('[MappingService] Found Wi-Fi payload (or equivalent for XML).');
      yamlSchema.passpoint_profile.home_friendly_name = get(wifiPayload, 'DisplayedOperatorName', get(wifiPayload, 'SSID_STR', '')); // Default to empty if none

      const roamingOIs = get(wifiPayload, 'RoamingConsortiumOIs', []);
      if (Array.isArray(roamingOIs)) {
        yamlSchema.passpoint_profile.roaming_consortiums = roamingOIs.map(oi => ({
          name: `Consortium ${oi}`, // You might want a more descriptive name source
          value: oi,
          length: oi.length / 2,
          organization_id: oi.substring(0, Math.min(6, oi.length))
        }));
      }

      const naiRealmName = get(wifiPayload, 'DomainName');
      if (naiRealmName) {
        yamlSchema.passpoint_profile.nai_realm.name = naiRealmName;
        yamlSchema.passpoint_profile.credential.realm = naiRealmName; // Often the same
      }
      
      const acceptedEapTypes = get(wifiPayload, 'EAPClientConfiguration.AcceptEAPTypes', []);
      if (Array.isArray(acceptedEapTypes)) {
        yamlSchema.passpoint_profile.nai_realm.eap_methods = acceptedEapTypes
          .map(typeNum => {
            let innerAuth;
            if (typeNum === 21) { // TTLS
              innerAuth = get(wifiPayload, 'EAPClientConfiguration.TTLSInnerAuthentication');
            } else if (typeNum === 18) { // PEAP
              innerAuth = get(wifiPayload, 'EAPClientConfiguration.InnerAuthentication', 'MSCHAPV2'); // Default for PEAP
            }
            const eapTypeStr = eapTypes[typeNum];
            if (!eapTypeStr) {
              console.warn(`[MappingService] Unknown EAP Type number: ${typeNum}`);
              return null;
            }
            return {
              eap_type: eapTypeStr,
              inner_auth: innerAuth,
              vendor_id: 0, // Placeholder - map if available
              vendor_type: 0, // Placeholder - map if available
            };
          })
          .filter(Boolean);
      }

      if (get(wifiPayload, 'EAPClientConfiguration.UserName')) {
        yamlSchema.passpoint_profile.credential.type = 'UsernamePassword';
        yamlSchema.passpoint_profile.credential.username = get(wifiPayload, 'EAPClientConfiguration.UserName', '');
        const password = get(wifiPayload, 'EAPClientConfiguration.UserPassword');
        if (password !== undefined) {
             yamlSchema.passpoint_profile.credential.password = password;
        }
      }
      // Add logic here to detect other credential types (e.g., SIM, TLS)
      // For example, if PayloadCertificateUUID exists, it might be EAP-TLS
      const certUUID = get(wifiPayload, 'EAPClientConfiguration.PayloadCertificateUUID');
      if (certUUID && yamlSchema.passpoint_profile.nai_realm.eap_methods.some(m => m.eap_type === 'TLS')) {
          yamlSchema.passpoint_profile.credential.type = 'TLSClientCertificate';
          yamlSchema.passpoint_profile.credential.certificate_payload_uuid = Array.isArray(certUUID) ? certUUID[0] : certUUID; // Assuming first cert if array
          // Clear username/password if it's cert-based
          yamlSchema.passpoint_profile.credential.username = '';
          yamlSchema.passpoint_profile.credential.password = '';
      }


      const homeOIsHex = get(wifiPayload, 'HomeOIs', []);
      if (Array.isArray(homeOIsHex)) {
        yamlSchema.passpoint_profile.home_ois = homeOIsHex.map((oi, index) => {
          if (typeof oi === 'string' && /^[0-9a-fA-F]+$/.test(oi)) {
            return {
              name: `Home OI ${index + 1}`, // You might want a more descriptive name source
              value: oi,
              length: oi.length / 2,
              organization_id: oi.substring(0, Math.min(6, oi.length))
            };
          }
          console.warn(`[MappingService] Invalid Home OI format: ${oi}`);
          return null;
        }).filter(Boolean);
      }

      // --- Start mapping new fields (examples, adapt paths as needed) ---
      yamlSchema.passpoint_profile.anqp_domain_id = get(wifiPayload, 'ANQPDomainID', '0'); // Example path

      // For venue_info, .mobileconfig might have VenueName, VenueType
      const venueNameFromProfile = get(wifiPayload, 'VenueName');
      if (venueNameFromProfile) {
        yamlSchema.passpoint_profile.venue_info.name = venueNameFromProfile;
      }
      // VenueGroup and VenueType might be numeric in .mobileconfig and need mapping
      // const venueTypeNum = get(wifiPayload, 'VenueType');
      // const venueGroupNum = get(wifiPayload, 'VenueGroup');
      // Map these numbers to strings if necessary.

      // For network_authentication_type, .mobileconfig might have NetworkAuthenticationTypeInfo
      // This often requires more complex mapping from its sub-fields.

      // For WAN Metrics, .mobileconfig has a WANMetrics dictionary
      const wanMetricsPayload = get(wifiPayload, 'WANMetrics');
      if (wanMetricsPayload) {
          yamlSchema.passpoint_profile.wan_metrics.link_status = get(wanMetricsPayload, 'LinkStatus', 'Up'); // 1=Up, 2=Down, 3=Test
          yamlSchema.passpoint_profile.wan_metrics.symmetric_link = get(wanMetricsPayload, 'SymmetricLink') === 0 ? 'Asymmetric' : (get(wanMetricsPayload, 'SymmetricLink') === 1 ? 'Symmetric' : 'Unknown');
          yamlSchema.passpoint_profile.wan_metrics.at_capacity = get(wanMetricsPayload, 'AtCapacity', false);
          yamlSchema.passpoint_profile.wan_metrics.downlink_speed = get(wanMetricsPayload, 'DownlinkSpeed', 0);
          yamlSchema.passpoint_profile.wan_metrics.uplink_speed = get(wanMetricsPayload, 'UplinkSpeed', 0);
          yamlSchema.passpoint_profile.wan_metrics.downlink_load = get(wanMetricsPayload, 'DownlinkLoad', 0);
          yamlSchema.passpoint_profile.wan_metrics.uplink_load = get(wanMetricsPayload, 'UplinkLoad', 0);
          yamlSchema.passpoint_profile.wan_metrics.lmd = get(wanMetricsPayload, 'LMD', 0);
      }

      // For OSU Providers, .mobileconfig has an OSUDevices array
      const osuDevices = get(wifiPayload, 'OSUDevices', []);
      if (Array.isArray(osuDevices)) {
        yamlSchema.passpoint_profile.osu_providers = osuDevices.map(dev => ({
          server_uri: get(dev, 'ServerURI', ''),
          method_list: get(dev, 'MethodList', []), // This might need mapping from numbers to strings
          friendly_name: get(dev, 'FriendlyName', ''),
          icon_url: '', // .mobileconfig doesn't usually have a direct icon URL here
          nai: get(dev, 'OSUIdentity.NAI', ''), // Example path for NAI within OSU
          description: get(dev, 'Description', '')
        }));
      }
      // --- End mapping new fields ---

    } else {
      console.warn('[MappingService] No suitable Wi-Fi payload found in the parsed data.');
    }
  } else {
    console.error('[MappingService] Unknown file type for mapping:', fileType);
  }

  console.log('[MappingService] Mapping complete. Resulting schema:', JSON.stringify(yamlSchema, null, 2));
  return yamlSchema;
}

module.exports = {
  mapToYamlSchema,
};