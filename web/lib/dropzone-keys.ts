export function shouldOpenPicker(key: string, onContainer: boolean): boolean {
    return onContainer && (key === "Enter" || key === " ")
}
