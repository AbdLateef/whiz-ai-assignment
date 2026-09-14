export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Strip non-digits
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  const parts = clean.split('@');
  if (parts.length === 2 && parts[1]) {
    return parts[1];
  }
  return null;
}

export function normalizeStatus(status: string | null | undefined): string {
  if (!status) return 'New';
  const clean = status.trim().toLowerCase();
  
  switch (clean) {
    case 'new':
      return 'New';
    case 'qualified':
      return 'Qualified';
    case 'connected':
      return 'Connected';
    case 'contacted':
      return 'Contacted';
    case 'opportunity':
      return 'Opportunity';
    case 'closed won':
      return 'Closed Won';
    case 'closed lost':
      return 'Closed Lost';
    default:
      // Capitalize first letter of each word
      return clean
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
  }
}

export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  const clean = dateStr.trim();

  // Try direct Date parsing (works for ISO like 2025-10-27T00:00:00Z and 2026-05-24)
  const isoDate = new Date(clean);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Handle M/D/YYYY format (e.g. 12/21/2025 or 5/30/2026)
  const mdyMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10) - 1;
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    const parsed = new Date(Date.UTC(year, month, day));
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

export function normalizeNames(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fullName: string | null | undefined
): { firstName: string | null; lastName: string | null; fullName: string | null } {
  let fName = firstName ? firstName.trim() : null;
  let lName = lastName ? lastName.trim() : null;
  let fullNameClean = fullName ? fullName.trim() : null;

  if (!fullNameClean && (fName || lName)) {
    fullNameClean = [fName, lName].filter(Boolean).join(' ');
  } else if (fullNameClean && !fName && !lName) {
    const nameParts = fullNameClean.split(' ');
    if (nameParts.length === 1) {
      fName = nameParts[0];
    } else {
      fName = nameParts.slice(0, -1).join(' ');
      lName = nameParts[nameParts.length - 1];
    }
  }

  return {
    firstName: fName || null,
    lastName: lName || null,
    fullName: fullNameClean || null
  };
}
