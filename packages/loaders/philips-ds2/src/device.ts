import type { DeviceInfo } from '@opencpap/core';

/** Model numbers seen in OSCAR's table (prs1_loader.cpp) for DreamStation 2 devices. */
const DS2_MODELS: Record<string, string> = {
  '410X150C': 'DreamStation 2 CPAP',
  '420X150C': 'DreamStation 2 Advanced CPAP',
  '520X110C': 'DreamStation 2 Auto CPAP Advanced',
  '520X130C': 'DreamStation 2 Auto CPAP Advanced',
  '520X150C': 'DreamStation 2 Auto CPAP Advanced',
  '521X120C': 'DreamStation 2 Auto CPAP Advanced with P-Flex',
  '521X140C': 'DreamStation 2 avec GSM + Humidificateur',
};

/** Parses the decrypted `PROP.BIN` (`KEY=value` lines). */
export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

export function deviceInfoFromProperties(props: Record<string, string>): DeviceInfo {
  const mn = props.MN ?? '';
  return {
    manufacturer: 'Philips Respironics',
    model: DS2_MODELS[mn] ?? (mn ? `DreamStation 2 (${mn})` : 'DreamStation 2'),
    serial: props.SN ?? '',
    firmware: props.SV,
  };
}
