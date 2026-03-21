from django.db import models


class AttendanceRecord(models.Model):
	name = models.CharField(max_length=255)
	timestamp = models.DateTimeField()
	status = models.CharField(max_length=50, default='Present')
	notes = models.TextField(blank=True, default='')

	class Meta:
		ordering = ['-timestamp']

	def __str__(self):
		return f"{self.name} - {self.status} @ {self.timestamp}"
