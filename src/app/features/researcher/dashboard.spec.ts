import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReseatcherDashboard } from './dashboard';

describe('ReseatcherDashboard', () => {
  let component: ReseatcherDashboard;
  let fixture: ComponentFixture<ReseatcherDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReseatcherDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReseatcherDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
