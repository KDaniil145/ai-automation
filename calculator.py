
def divide(a, b):
    if b == 0:
        raise ValueError("Division by zero")

    return a / b


def calculate_average(numbers):
    if not numbers:
        return 0

    return sum(numbers) / len(numbers)
