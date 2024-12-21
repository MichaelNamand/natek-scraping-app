export function convertFrenchDateToDDMMYYYY(frenchDate) {
    // Mapping French month names to numerical values
    const months = {
        'Jan': '01', 'Fév': '02', 'Mar': '03', 'Avr': '04', 'Mai': '05', 'Juin': '06',
        'Juil': '07', 'Aoû': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Déc': '12'
    };

    const today = new Date();

    console.log(frenchDate);

    if (frenchDate === 'Aujourd’hui') {
        const day = today.getDate().toString().padStart(2, '0');
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const year = today.getFullYear();
        return `${day}/${month}/${year}`;
    }
    if (frenchDate === "Hier") {
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const day = yesterday.getDate().toString().padStart(2, '0');
        const month = (yesterday.getMonth() + 1).toString().padStart(2, '0');
        const year = yesterday.getFullYear();
        return `${day}/${month}/${year}`;
    }
    if (frenchDate === "Jamais") {
        return frenchDate;
    }

    // Split the input date
    const parts = frenchDate.split(' ');

    if (parts.length !== 3) {
        throw new Error('Invalid date format');
    }

    const day = parts[0];
    const month = months[parts[1]];
    const year = parts[2];

    if (!month) {
        throw new Error('Invalid month name');
    }

    // Return the formatted date in dd/mm/yyyy
    return `${day.padStart(2, '0')}/${month}/${year}`;
}